import type { PaymentStatus, Prisma } from "../../../generated/prisma/client.js";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { StripeCheckoutPaymentGateway } from "../appointment/appointment-payment.service.js";
import { paymentInvoiceService } from "./payment-invoice.service.js";
import type {
  AdminPaymentActionInput,
  AdminPaymentDashboardQuery,
  PaymentHistoryQuery,
  RefundPaymentInput,
} from "./payment.validation.js";

export type PaymentActor = { userId: string; role: ApplicationRole; profileId?: string };
const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const include = {
  appointment: { include: { patient: true, doctor: true, schedule: true } },
  attempts: { orderBy: { createdAt: "desc" as const } },
  refunds: { orderBy: { createdAt: "desc" as const } },
  invoices: { orderBy: { version: "desc" as const } },
} satisfies Prisma.PaymentInclude;
type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof include }>;

const mask = (value: string | null) => (value ? `${value.slice(0, 3)}***${value.slice(-4)}` : null);
const authorize = (payment: PaymentRecord, actor: PaymentActor) => {
  const allowed =
    isAdmin(actor.role) ||
    (actor.role === "PATIENT" && actor.profileId === payment.appointment.patientId) ||
    (actor.role === "DOCTOR" && actor.profileId === payment.appointment.doctorId);
  if (!allowed) throw new ApiError(403, "You cannot access this payment", "FORBIDDEN");
};
const view = (payment: PaymentRecord, actor: PaymentActor) => ({
  id: payment.id,
  appointmentId: payment.appointmentId,
  amount: payment.amount,
  taxAmount: payment.taxAmount,
  totalAmount: payment.amount + payment.taxAmount,
  currency: payment.currency,
  status: payment.status,
  paymentMethod: payment.paymentMethod,
  cardLast4: payment.cardLast4,
  paidAt: payment.paidAt,
  expiresAt: payment.expiresAt,
  refundAmount: payment.refundAmount,
  refundedAt: payment.refundedAt,
  transactionId: isAdmin(actor.role) ? payment.transactionId : mask(payment.transactionId),
  stripePaymentIntentId: isAdmin(actor.role)
    ? payment.stripePaymentIntentId
    : mask(payment.stripePaymentIntentId),
  appointment: {
    patient: { id: payment.appointment.patientId, name: payment.appointment.patient.name },
    doctor: { id: payment.appointment.doctorId, name: payment.appointment.doctor.name },
    schedule: payment.appointment.schedule,
  },
  attempts: payment.attempts.map((attempt) => ({
    ...attempt,
    providerAttemptId: isAdmin(actor.role)
      ? attempt.providerAttemptId
      : mask(attempt.providerAttemptId),
  })),
  refunds: payment.refunds.map((refund) => ({
    ...refund,
    stripeRefundId: isAdmin(actor.role) ? refund.stripeRefundId : mask(refund.stripeRefundId),
  })),
  invoices: payment.invoices.map(
    ({ objectKey: _objectKey, fileUrl: _fileUrl, ...invoice }) => invoice,
  ),
});
const dateWhere = (query: PaymentHistoryQuery): Prisma.DateTimeFilter | undefined =>
  query.startDate || query.endDate
    ? {
        gte: query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : undefined,
        lte: query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : undefined,
      }
    : undefined;

export class PaymentService {
  private readonly gateway = new StripeCheckoutPaymentGateway();

  async get(paymentId: string, actor: PaymentActor, context: RequestContext) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, isDeleted: false },
      include,
    });
    if (!payment) throw new ApiError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    authorize(payment, actor);
    await prisma.auditLog.create({
      data: {
        action: "PAYMENT_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { paymentId, actorUserId: actor.userId },
      },
    });
    return view(payment, actor);
  }

  async history(
    owner: { patientId?: string; doctorId?: string },
    query: PaymentHistoryQuery,
    actor: PaymentActor,
  ) {
    if (owner.patientId && actor.role === "PATIENT" && actor.profileId !== owner.patientId)
      throw new ApiError(403, "Patients can only view their payment history", "FORBIDDEN");
    if (owner.doctorId && actor.role === "DOCTOR" && actor.profileId !== owner.doctorId)
      throw new ApiError(403, "Doctors can only view their payment history", "FORBIDDEN");
    if (
      (owner.patientId && actor.role === "DOCTOR") ||
      (owner.doctorId && actor.role === "PATIENT")
    )
      throw new ApiError(403, "Payment history access is denied", "FORBIDDEN");
    const where: Prisma.PaymentWhereInput = {
      isDeleted: false,
      status: query.status,
      amount:
        query.minAmount !== undefined || query.maxAmount !== undefined
          ? { gte: query.minAmount, lte: query.maxAmount }
          : undefined,
      createdAt: dateWhere(query),
      appointment: { patientId: owner.patientId, doctorId: owner.doctorId },
    };
    const [payments, total, aggregate] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where,
        _sum: { amount: true, taxAmount: true, refundAmount: true },
      }),
    ]);
    return {
      payments: payments.map((payment) => view(payment, actor)),
      totals: {
        charged: (aggregate._sum.amount ?? 0) + (aggregate._sum.taxAmount ?? 0),
        refunded: aggregate._sum.refundAmount ?? 0,
      },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async refund(
    paymentId: string,
    input: RefundPaymentInput,
    actor: PaymentActor,
    context: RequestContext,
  ) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, isDeleted: false },
      include,
    });
    if (!payment) throw new ApiError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    if (payment.appointment.status !== "CANCELLED")
      throw new ApiError(
        409,
        "The appointment must be cancelled before refunding",
        "APPOINTMENT_NOT_CANCELLED",
      );
    if (!["PAID", "PARTIAL_REFUND"].includes(payment.status))
      throw new ApiError(409, "Only paid payments can be refunded", "PAYMENT_NOT_REFUNDABLE");
    const remaining = payment.amount + payment.taxAmount - payment.refundAmount;
    const amount = input.amount ?? remaining;
    if (amount > remaining)
      throw new ApiError(400, "Refund exceeds the remaining paid amount", "REFUND_AMOUNT_EXCEEDED");
    const provider = await this.gateway.refund({
      paymentId,
      appointmentId: payment.appointmentId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      amount,
      reason: input.reason,
    });
    const refundAmount = payment.refundAmount + amount;
    const status: PaymentStatus =
      refundAmount === payment.amount + payment.taxAmount ? "REFUNDED" : "PARTIAL_REFUND";
    const updated = await prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          paymentId,
          stripeRefundId: provider.providerRefundId,
          amount,
          reason: input.reason,
          status: provider.status,
        },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status,
          refundAmount,
          refundedAt: new Date(),
          stripeRefundId: status === "REFUNDED" ? provider.providerRefundId : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "PAYMENT_REFUNDED",
          userId: actor.userId,
          ...context,
          metadata: { paymentId, refundId: refund.id, amount, reason: input.reason },
        },
      });
      return refund;
    });
    return { refund: updated, paymentStatus: status, totalRefunded: refundAmount };
  }

  async adminAction(
    paymentId: string,
    input: AdminPaymentActionInput,
    actor: PaymentActor,
    context: RequestContext,
  ) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, isDeleted: false },
      include,
    });
    if (!payment) throw new ApiError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    if (input.action === "RETRY" && payment.retryCount >= 3)
      throw new ApiError(409, "Maximum payment attempts reached", "PAYMENT_RETRY_LIMIT");
    if (input.action === "RETRY" && payment.appointment.status === "CANCELLED")
      throw new ApiError(409, "Cancelled appointments cannot be paid", "APPOINTMENT_CANCELLED");
    const retry =
      input.action === "RETRY"
        ? await this.gateway.pending({
            paymentId: payment.id,
            appointmentId: payment.appointmentId,
            amount: payment.amount,
            patientId: payment.appointment.patientId,
            patientEmail: payment.appointment.patient.email,
            doctorId: payment.appointment.doctorId,
            attempt: payment.retryCount + 1,
            now: new Date(),
          })
        : null;
    const data: Prisma.PaymentUpdateInput =
      input.action === "RETRY"
        ? {
            status: "PENDING",
            retryCount: { increment: 1 },
            paymentLink: retry!.paymentLink,
            expiresAt: retry!.expiresAt,
            stripeCheckoutSessionId: retry!.stripeCheckoutSessionId,
            stripePaymentIntentId: retry!.stripePaymentIntentId,
          }
        : input.action === "MARK_PAID"
          ? { status: "PAID", transactionId: input.transactionId, paidAt: new Date() }
          : { notes: input.notes };
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.payment.update({ where: { id: paymentId }, data });
      if (input.action === "RETRY")
        await tx.paymentAttempt.create({
          data: {
            paymentId,
            status: "PENDING",
            amount: payment.amount + payment.taxAmount,
            providerAttemptId: retry?.stripeCheckoutSessionId,
          },
        });
      if (input.action === "MARK_PAID")
        await tx.paymentAttempt.create({
          data: {
            paymentId,
            status: "PAID",
            amount: payment.amount + payment.taxAmount,
            providerAttemptId: input.transactionId,
          },
        });
      await tx.auditLog.create({
        data: {
          action: "PAYMENT_ADMIN_ACTION",
          userId: actor.userId,
          ...context,
          metadata: { paymentId, action: input.action, justification: input.justification },
        },
      });
      return saved;
    });
    if (input.action === "MARK_PAID")
      void paymentInvoiceService.generate(paymentId).catch(() => undefined);
    return updated;
  }

  async dashboard(query: AdminPaymentDashboardQuery, actor: PaymentActor) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const createdAt = dateWhere({ ...query, page: 1, limit: 50 });
    const where: Prisma.PaymentWhereInput = { isDeleted: false, createdAt };
    const [payments, statuses, totals, recent] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        select: { amount: true, taxAmount: true, refundAmount: true, paidAt: true, status: true },
      }),
      prisma.payment.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.payment.aggregate({
        where: { ...where, status: { in: ["PAID", "PARTIAL_REFUND", "REFUNDED"] } },
        _sum: { amount: true, taxAmount: true, refundAmount: true },
      }),
      prisma.payment.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();
    for (const item of payments.filter((item) => item.paidAt)) {
      const net = item.amount + item.taxAmount - item.refundAmount;
      const day = item.paidAt!.toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + net);
      monthly.set(day.slice(0, 7), (monthly.get(day.slice(0, 7)) ?? 0) + net);
    }
    const totalCount = statuses.reduce((sum, row) => sum + row._count._all, 0);
    const refundCount = statuses
      .filter((row) => ["REFUNDED", "PARTIAL_REFUND"].includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
    return {
      revenue: {
        allTime:
          (totals._sum.amount ?? 0) +
          (totals._sum.taxAmount ?? 0) -
          (totals._sum.refundAmount ?? 0),
        daily: Object.fromEntries(daily),
        monthly: Object.fromEntries(monthly),
      },
      statusBreakdown: Object.fromEntries(statuses.map((row) => [row.status, row._count._all])),
      refundRate: totalCount ? refundCount / totalCount : 0,
      recent: recent.map((payment) => view(payment, actor)),
    };
  }

  async invoice(paymentId: string, actor: PaymentActor, context: RequestContext) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, isDeleted: false },
      include,
    });
    if (!payment) throw new ApiError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    authorize(payment, actor);
    const invoice = await paymentInvoiceService.download(paymentId);
    await prisma.auditLog.create({
      data: {
        action: "INVOICE_DOWNLOADED",
        userId: actor.userId,
        ...context,
        metadata: { paymentId, invoiceId: invoice.id },
      },
    });
    return invoice;
  }
}

export const paymentService = new PaymentService();
