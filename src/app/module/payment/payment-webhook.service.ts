import type Stripe from "stripe";

import type { Prisma } from "../../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { requireStripe } from "../../config/stripe.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { prisma } from "../../lib/prisma.js";
import { paymentInvoiceService } from "./payment-invoice.service.js";

const serializable = (event: Stripe.Event): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;

const paymentFrom = async (
  metadata: Stripe.Metadata | null | undefined,
  intentId?: string | null,
  sessionId?: string | null,
) => {
  const paymentId = metadata?.paymentId;
  return prisma.payment.findFirst({
    where: {
      isDeleted: false,
      OR: [
        ...(paymentId ? [{ id: paymentId }] : []),
        ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
        ...(sessionId ? [{ stripeCheckoutSessionId: sessionId }] : []),
      ],
    },
    include: { appointment: true },
  });
};

export class PaymentWebhookService {
  construct(rawBody: Buffer, signature: string): Stripe.Event {
    if (!env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError(503, "Webhook signing secret is not configured", "WEBHOOK_UNAVAILABLE");
    try {
      return requireStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new ApiError(400, "Stripe webhook signature is invalid", "INVALID_WEBHOOK_SIGNATURE");
    }
  }

  async process(event: Stripe.Event): Promise<{ duplicate: boolean }> {
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (
      existing?.status === "PROCESSED" ||
      (existing?.status === "PROCESSING" &&
        existing.updatedAt.getTime() > Date.now() - 5 * 60 * 1_000)
    )
      return { duplicate: true };
    if (existing) {
      await prisma.stripeWebhookEvent.update({
        where: { id: existing.id },
        data: { status: "PROCESSING", errorMessage: null, payload: serializable(event) },
      });
    } else {
      try {
        await prisma.stripeWebhookEvent.create({
          data: { stripeEventId: event.id, eventType: event.type, payload: serializable(event) },
        });
      } catch {
        return { duplicate: true };
      }
    }

    let invoicePaymentId: string | undefined;
    try {
      if (event.type === "checkout.session.completed") {
        invoicePaymentId = await this.checkoutCompleted(event.data.object);
      } else if (event.type === "payment_intent.succeeded") {
        invoicePaymentId = await this.succeeded(event.data.object);
      } else if (
        event.type === "payment_intent.payment_failed" ||
        event.type === "payment_intent.canceled"
      ) {
        await this.failed(event.data.object, event.type);
      } else if (event.type === "charge.refunded") {
        await this.refunded(event.data.object);
      } else if (event.type === "charge.succeeded") {
        await this.chargeSucceeded(event.data.object);
      }
      await prisma.$transaction(async (tx) => {
        await tx.stripeWebhookEvent.update({
          where: { stripeEventId: event.id },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            action: "PAYMENT_WEBHOOK_PROCESSED",
            metadata: { stripeEventId: event.id, eventType: event.type },
          },
        });
      });
      if (invoicePaymentId)
        void paymentInvoiceService.generate(invoicePaymentId).catch(() => undefined);
      return { duplicate: false };
    } catch (error) {
      await prisma.stripeWebhookEvent
        .update({
          where: { stripeEventId: event.id },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message.slice(0, 1000) : "Unknown webhook error",
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async checkoutCompleted(session: Stripe.Checkout.Session): Promise<string | undefined> {
    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    const payment = await paymentFrom(session.metadata, intentId, session.id);
    if (!payment) return undefined;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: intentId,
        ...(session.payment_status === "paid" ? { status: "PAID", paidAt: new Date() } : {}),
      },
    });
    return session.payment_status === "paid" ? payment.id : undefined;
  }

  private async succeeded(intent: Stripe.PaymentIntent): Promise<string | undefined> {
    const payment = await paymentFrom(intent.metadata, intent.id);
    if (!payment) return undefined;
    if (payment.appointment.status === "CANCELLED")
      throw new ApiError(
        409,
        "Payment received for a cancelled appointment",
        "CANCELLED_APPOINTMENT_PAYMENT",
      );
    const expected = (payment.amount + payment.taxAmount) * 100;
    if (intent.amount_received !== expected)
      throw new ApiError(
        409,
        "Stripe amount does not match the appointment charge",
        "PAYMENT_AMOUNT_MISMATCH",
      );
    const latestCharge =
      typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          stripePaymentIntentId: intent.id,
          transactionId: latestCharge ?? intent.id,
          paidAt: new Date(),
          paymentMethod: intent.payment_method_types[0] ?? null,
        },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          providerAttemptId: intent.id,
          status: "PAID",
          amount: payment.amount + payment.taxAmount,
        },
      });
      await tx.auditLog.create({
        data: {
          action: "PAYMENT_STATUS_UPDATED",
          metadata: { paymentId: payment.id, status: "PAID", stripePaymentIntentId: intent.id },
        },
      });
    });
    return payment.id;
  }

  private async failed(intent: Stripe.PaymentIntent, eventType: string) {
    const payment = await paymentFrom(intent.metadata, intent.id);
    if (!payment || payment.status === "PAID") return;
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", stripePaymentIntentId: intent.id },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          providerAttemptId: intent.id,
          status: "FAILED",
          amount: payment.amount + payment.taxAmount,
          failureCode: intent.last_payment_error?.code,
          failureMessage: intent.last_payment_error?.message,
        },
      });
      await tx.appointment.update({
        where: { id: payment.appointmentId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancellationReason: `Payment ${eventType}`,
        },
      });
      await tx.schedule.update({
        where: { id: payment.appointment.scheduleId },
        data: { isBooked: false },
      });
    });
  }

  private async refunded(charge: Stripe.Charge) {
    const intentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const payment = await paymentFrom(charge.metadata, intentId);
    if (!payment) return;
    const refunded = Math.round(charge.amount_refunded / 100);
    const total = payment.amount + payment.taxAmount;
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundAmount: refunded,
          refundedAt: new Date(),
          transactionId: charge.id,
          status: refunded >= total ? "REFUNDED" : "PARTIAL_REFUND",
        },
      });
      for (const stripeRefund of charge.refunds?.data ?? []) {
        await tx.refund.upsert({
          where: { stripeRefundId: stripeRefund.id },
          create: {
            paymentId: payment.id,
            stripeRefundId: stripeRefund.id,
            amount: Math.round(stripeRefund.amount / 100),
            status: stripeRefund.status ?? "pending",
            reason: stripeRefund.metadata?.reason,
          },
          update: { status: stripeRefund.status ?? "pending" },
        });
      }
    });
  }

  private async chargeSucceeded(charge: Stripe.Charge) {
    const intentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const payment = await paymentFrom(charge.metadata, intentId);
    if (!payment) return;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        transactionId: charge.id,
        paymentMethod: charge.payment_method_details?.type ?? null,
        cardLast4: charge.payment_method_details?.card?.last4 ?? null,
      },
    });
  }
}

export const paymentWebhookService = new PaymentWebhookService();
