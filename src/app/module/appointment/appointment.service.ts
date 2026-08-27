import { randomUUID } from "node:crypto";

import type {
  AppointmentStatus,
  PaymentStatus,
  Prisma,
  UserRole,
} from "../../../generated/prisma/client.js";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { addIsoDays } from "../schedule/schedule.validation.js";
import { AppointmentEmailService } from "./appointment-email.service.js";
import {
  StripeCheckoutPaymentGateway,
  type AppointmentPaymentGateway,
} from "./appointment-payment.service.js";
import { appointmentWindow, hoursUntil } from "./appointment-time.service.js";
import { AppointmentVideoService } from "./appointment-video.service.js";
import type {
  AdminAppointmentQuery,
  BookAppointmentInput,
  CancelAppointmentInput,
  DoctorAppointmentQuery,
  PatientAppointmentQuery,
  UpdateAppointmentStatusInput,
} from "./appointment.validation.js";

export type AppointmentActor = { userId: string; role: ApplicationRole; profileId?: string };
const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const activeStatuses: AppointmentStatus[] = ["SCHEDULED", "INPROGRESS"];
const appointmentInclude = {
  patient: { include: { user: true, healthData: true } },
  doctor: { include: { user: true, specialties: { include: { specialty: true } } } },
  schedule: true,
  payment: true,
  prescription: true,
  review: true,
} satisfies Prisma.AppointmentInclude;
type AppointmentRecord = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

const invalidate = (appointment: { id: string; patientId: string; doctorId: string }) => {
  applicationCache.deleteByPrefix(
    `appointment:${appointment.id}:`,
    `appointments:patient:${appointment.patientId}:`,
    `appointments:doctor:${appointment.doctorId}:`,
    "appointments:admin:",
    `schedules:doctor:${appointment.doctorId}:`,
    `doctor:${appointment.doctorId}`,
    "patients:list:",
  );
};
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const dbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

export const isValidAppointmentTransition = (
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean =>
  (from === "SCHEDULED" && (to === "INPROGRESS" || to === "CANCELLED")) ||
  (from === "INPROGRESS" && to === "COMPLETED");
export const applyAppointmentDiscount = (amount: number, discountBps: number): number =>
  Math.round((amount * (10_000 - Math.min(Math.max(discountBps, 0), 10_000))) / 10_000);

export const calculateCancellation = (
  actorRole: ApplicationRole,
  hoursBeforeStart: number,
  amount: number,
  paymentStatus: PaymentStatus,
) => {
  if (actorRole === "PATIENT" && hoursBeforeStart < 24) {
    throw new ApiError(
      400,
      "Patients must cancel at least 24 hours before the appointment",
      "CANCELLATION_WINDOW_CLOSED",
    );
  }
  if (actorRole === "DOCTOR" && hoursBeforeStart < 12) {
    throw new ApiError(
      400,
      "Doctors must cancel at least 12 hours before the appointment",
      "CANCELLATION_WINDOW_CLOSED",
    );
  }
  const ratio = hoursBeforeStart >= 24 ? 1 : hoursBeforeStart >= 12 ? 0.5 : 0;
  const refundAmount = paymentStatus === "PAID" ? Math.round(amount * ratio) : 0;
  const refundType =
    refundAmount === amount && amount > 0 ? "FULL" : refundAmount > 0 ? "PARTIAL" : "NONE";
  const nextPaymentStatus: PaymentStatus =
    paymentStatus === "PENDING"
      ? "FAILED"
      : refundType === "FULL"
        ? "REFUNDED"
        : refundType === "PARTIAL"
          ? "PARTIAL_REFUND"
          : paymentStatus;
  return { refundAmount, refundType, nextPaymentStatus } as const;
};

const listView = (appointment: AppointmentRecord, perspective: "PATIENT" | "DOCTOR" | "ADMIN") => ({
  id: appointment.id,
  status: appointment.status,
  appointmentFee: appointment.appointmentFee,
  videoCallingId: appointment.videoCallingId,
  notes: appointment.notes,
  createdAt: appointment.createdAt,
  doctor: {
    id: appointment.doctor.id,
    name: appointment.doctor.name,
    specialty: appointment.doctor.specialties[0]?.specialty.title ?? null,
    profilePhoto: appointment.doctor.profilePhoto,
  },
  patient: {
    id: appointment.patient.id,
    name: appointment.patient.name,
    contactNumber: appointment.patient.contactNumber,
    ...(perspective === "DOCTOR" || perspective === "ADMIN"
      ? {
          healthSummary: appointment.patient.healthData
            ? {
                bloodGroup: appointment.patient.healthData.bloodGroup,
                allergies: appointment.patient.healthData.allergies,
                chronicConditions: appointment.patient.healthData.chronicConditions,
              }
            : null,
        }
      : {}),
  },
  schedule: {
    scheduleDate: dateString(appointment.schedule.scheduleDate),
    startTime: appointment.schedule.startTime,
    endTime: appointment.schedule.endTime,
  },
  payment: appointment.payment
    ? {
        id: appointment.payment.id,
        amount: appointment.payment.amount,
        currency: appointment.payment.currency,
        status: appointment.payment.status,
      }
    : null,
});

const scheduleDateWhere = (
  startDate?: string,
  endDate?: string,
): Prisma.ScheduleWhereInput | undefined =>
  startDate || endDate
    ? {
        scheduleDate: {
          gte: startDate ? dbDate(startDate) : undefined,
          lte: endDate ? dbDate(endDate) : undefined,
        },
      }
    : undefined;

const patientScheduleWhere = (
  startDate?: string,
  endDate?: string,
  upcoming?: boolean,
): Prisma.ScheduleWhereInput | undefined => {
  if (!startDate && !endDate && upcoming === undefined) return undefined;
  const today = dbDate(new Date().toISOString().slice(0, 10));
  let lower = startDate ? dbDate(startDate) : undefined;
  if (upcoming === true && (!lower || lower < today)) lower = today;
  return {
    scheduleDate: {
      gte: lower,
      lte: endDate ? dbDate(endDate) : undefined,
      ...(upcoming === false ? { lt: today } : {}),
    },
  };
};

export class AppointmentService {
  constructor(
    private readonly payments: AppointmentPaymentGateway = new StripeCheckoutPaymentGateway(),
    private readonly videos = new AppointmentVideoService(),
    private readonly emails = new AppointmentEmailService(),
  ) {}

  async book(
    input: BookAppointmentInput,
    actor: AppointmentActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (actor.role !== "PATIENT" && !isAdmin(actor.role)) {
      throw new ApiError(
        403,
        "Only patients and administrators can book appointments",
        "FORBIDDEN",
      );
    }
    if (actor.role === "PATIENT" && actor.profileId !== input.patientId) {
      throw new ApiError(403, "Patients can only book appointments for themselves", "FORBIDDEN");
    }
    if (input.emergency && !isAdmin(actor.role)) {
      throw new ApiError(403, "Only administrators can create emergency appointments", "FORBIDDEN");
    }
    const appointmentId = randomUUID();
    const paymentId = randomUUID();
    const videoCallingId = this.videos.createMeetingId();

    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`patient:${input.patientId}`}))`;
      const locked = await transaction.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "schedules" WHERE "id" = ${input.scheduleId} FOR UPDATE`;
      if (!locked.length) throw new ApiError(404, "Schedule was not found", "SCHEDULE_NOT_FOUND");

      const [patient, doctor, schedule] = await Promise.all([
        transaction.patient.findFirst({
          where: { id: input.patientId, isDeleted: false, user: { status: "ACTIVE" } },
          include: { user: true, healthData: true },
        }),
        transaction.doctor.findFirst({
          where: { id: input.doctorId, isDeleted: false, user: { status: "ACTIVE" } },
          include: { user: true },
        }),
        transaction.schedule.findFirst({
          where: {
            id: input.scheduleId,
            isDeleted: false,
            isBooked: false,
            doctors: { some: { doctorId: input.doctorId, isActive: true } },
          },
        }),
      ]);
      if (!patient) throw new ApiError(404, "Active patient was not found", "PATIENT_NOT_FOUND");
      if (!patient.healthData)
        throw new ApiError(
          400,
          "Complete patient health data before booking",
          "HEALTH_DATA_REQUIRED",
        );
      if (!doctor)
        throw new ApiError(400, "Doctor is inactive or unavailable", "DOCTOR_UNAVAILABLE");
      if (!schedule)
        throw new ApiError(
          409,
          "Schedule is unavailable or already booked",
          "SCHEDULE_ALREADY_BOOKED",
        );
      const { startsAt } = appointmentWindow(schedule);
      if (startsAt <= now)
        throw new ApiError(400, "Past appointment slots cannot be booked", "PAST_APPOINTMENT_SLOT");

      const targetDate = dateString(schedule.scheduleDate);
      if (!input.emergency) {
        const monthStart = `${targetDate.slice(0, 7)}-01`;
        const nextMonth = new Date(`${monthStart}T00:00:00.000Z`);
        nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
        const monthly = await transaction.appointment.count({
          where: {
            patientId: input.patientId,
            isDeleted: false,
            status: { not: "CANCELLED" },
            schedule: { scheduleDate: { gte: dbDate(monthStart), lt: nextMonth } },
          },
        });
        if (monthly >= 5)
          throw new ApiError(
            409,
            "Patients can book at most five appointments per month",
            "MONTHLY_APPOINTMENT_LIMIT",
          );
        const doctorSpam = await transaction.appointment.findFirst({
          where: {
            patientId: input.patientId,
            doctorId: input.doctorId,
            isDeleted: false,
            status: { not: "CANCELLED" },
            schedule: {
              scheduleDate: {
                gte: dbDate(addIsoDays(targetDate, -7)),
                lte: dbDate(addIsoDays(targetDate, 7)),
              },
            },
          },
          select: { id: true },
        });
        if (doctorSpam)
          throw new ApiError(
            409,
            "The same doctor cannot be booked again within seven days",
            "DOCTOR_REBOOKING_LIMIT",
          );
      }
      const sameDay = await transaction.appointment.findMany({
        where: {
          patientId: input.patientId,
          isDeleted: false,
          status: { in: activeStatuses },
          schedule: { scheduleDate: schedule.scheduleDate },
        },
        include: { schedule: true },
      });
      if (
        sameDay.some(
          ({ schedule: existing }) =>
            existing.startTime < schedule.endTime && schedule.startTime < existing.endTime,
        )
      ) {
        throw new ApiError(
          409,
          "Patient already has an overlapping appointment",
          "PATIENT_DOUBLE_BOOKING",
        );
      }

      const discountBps = patient.appointmentDiscountBps;
      const appointmentFee = applyAppointmentDiscount(doctor.appointmentFee, discountBps);
      const pending = await this.payments.pending({
        paymentId,
        appointmentId,
        amount: appointmentFee,
        patientId: patient.id,
        patientEmail: patient.email,
        doctorId: doctor.id,
        now,
      });
      const appointment = await transaction.appointment.create({
        data: {
          id: appointmentId,
          patientId: patient.id,
          doctorId: doctor.id,
          scheduleId: schedule.id,
          appointmentFee,
          notes: input.notes,
          videoCallingId,
          payment: {
            create: {
              id: pending.id,
              amount: pending.amount,
              currency: pending.currency,
              status: pending.status,
              paymentLink: pending.paymentLink,
              expiresAt: pending.expiresAt,
              stripeCheckoutSessionId: pending.stripeCheckoutSessionId,
              stripePaymentIntentId: pending.stripePaymentIntentId,
              taxRateBps: pending.taxRateBps ?? 0,
              taxAmount: pending.taxAmount ?? 0,
              attempts: {
                create: {
                  status: "PENDING",
                  amount: pending.amount + (pending.taxAmount ?? 0),
                  providerAttemptId: pending.stripeCheckoutSessionId,
                },
              },
            },
          },
        },
        include: appointmentInclude,
      });
      await transaction.schedule.update({ where: { id: schedule.id }, data: { isBooked: true } });
      if (discountBps > 0)
        await transaction.patient.update({
          where: { id: patient.id },
          data: { appointmentDiscountBps: 0 },
        });
      await transaction.auditLog.create({
        data: {
          action: "APPOINTMENT_BOOKED",
          userId: patient.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            appointmentId,
            patientId: patient.id,
            doctorId: doctor.id,
            scheduleId: schedule.id,
            emergency: input.emergency,
            discountBps,
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "PAYMENT_INITIATED",
          userId: patient.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            appointmentId,
            paymentId,
            amount: pending.amount,
            checkoutSessionId: pending.stripeCheckoutSessionId,
          },
        },
      });
      return {
        appointment,
        paymentInitiation: {
          checkoutUrl: pending.paymentLink,
          clientSecret: pending.clientSecret ?? null,
        },
      };
    });
    invalidate(result.appointment);
    await this.emails.sendBooked({
      patientEmail: result.appointment.patient.email,
      doctorEmail: result.appointment.doctor.email,
      date: dateString(result.appointment.schedule.scheduleDate),
      time: result.appointment.schedule.startTime,
      paymentLink: result.appointment.payment!.paymentLink!,
    });
    return {
      appointment: listView(result.appointment, "PATIENT"),
      payment: { ...result.appointment.payment, ...result.paymentInitiation },
      schedule: listView(result.appointment, "PATIENT").schedule,
    };
  }

  private async assertPatientView(patientId: string, actor: AppointmentActor) {
    if (actor.role === "PATIENT" && actor.profileId !== patientId)
      throw new ApiError(403, "Patients can only view their own appointments", "FORBIDDEN");
    if (actor.role === "DOCTOR")
      throw new ApiError(403, "Use the doctor appointment view", "FORBIDDEN");
  }

  async listPatient(
    patientId: string,
    query: PatientAppointmentQuery,
    actor: AppointmentActor,
    context: RequestContext,
  ) {
    await this.assertPatientView(patientId, actor);
    const scheduleFilter = patientScheduleWhere(query.startDate, query.endDate, query.upcoming);
    const where: Prisma.AppointmentWhereInput = {
      patientId,
      isDeleted: false,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(scheduleFilter ? { schedule: scheduleFilter } : {}),
    };
    const [appointments, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.appointment.count({ where }),
    ]);
    await prisma.auditLog.create({
      data: {
        action: "APPOINTMENT_LIST_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { actorUserId: actor.userId, patientId },
      },
    });
    return {
      appointments: appointments.map((item) => listView(item, "PATIENT")),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async listDoctor(
    doctorId: string,
    query: DoctorAppointmentQuery,
    actor: AppointmentActor,
    context: RequestContext,
  ) {
    if (actor.role === "PATIENT" || (actor.role === "DOCTOR" && actor.profileId !== doctorId)) {
      throw new ApiError(403, "Doctors can only view their own appointments", "FORBIDDEN");
    }
    const dateWhere = query.date
      ? { scheduleDate: dbDate(query.date) }
      : scheduleDateWhere(query.startDate, query.endDate);
    const where: Prisma.AppointmentWhereInput = {
      doctorId,
      isDeleted: false,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(dateWhere ? { schedule: dateWhere } : {}),
      ...(query.patientSearch
        ? { patient: { name: { contains: query.patientSearch, mode: "insensitive" } } }
        : {}),
      ...(query.paymentStatus ? { payment: { status: query.paymentStatus } } : {}),
    };
    const [appointments, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ schedule: { scheduleDate: "asc" } }, { schedule: { startTime: "asc" } }],
      }),
      prisma.appointment.count({ where }),
    ]);
    await prisma.auditLog.create({
      data: {
        action: "APPOINTMENT_LIST_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { actorUserId: actor.userId, doctorId },
      },
    });
    const views = appointments.map((item) => listView(item, "DOCTOR"));
    const groupedByDate = views.reduce<Record<string, typeof views>>((groups, item) => {
      (groups[item.schedule.scheduleDate] ??= []).push(item);
      return groups;
    }, {});
    return {
      appointments: views,
      groupedByDate,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getById(
    appointmentId: string,
    actor: AppointmentActor,
    context: RequestContext,
    now = new Date(),
  ) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, isDeleted: false },
      include: appointmentInclude,
    });
    if (!appointment) throw new ApiError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    const owns =
      (actor.role === "PATIENT" && actor.profileId === appointment.patientId) ||
      (actor.role === "DOCTOR" && actor.profileId === appointment.doctorId) ||
      isAdmin(actor.role);
    if (!owns) throw new ApiError(403, "You cannot access this appointment", "FORBIDDEN");
    const videoCallLink = await this.videos.accessLink(appointment, actor, now);
    await prisma.auditLog.create({
      data: {
        action: "APPOINTMENT_DETAIL_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { actorUserId: actor.userId, appointmentId },
      },
    });
    return {
      ...listView(
        appointment,
        actor.role === "DOCTOR" ? "DOCTOR" : isAdmin(actor.role) ? "ADMIN" : "PATIENT",
      ),
      videoCallLink,
      prescription: appointment.prescription
        ? {
            id: appointment.prescription.id,
            prescriptionNumber: appointment.prescription.prescriptionNumber,
            version: appointment.prescription.version,
            followUpDate: appointment.prescription.followUpDate,
          }
        : null,
      review: appointment.review
        ? {
            id: appointment.review.id,
            rating: appointment.review.rating,
            comment: appointment.review.comment,
            createdAt: appointment.review.createdAt,
          }
        : null,
      cancellation: appointment.cancelledAt
        ? {
            cancelledAt: appointment.cancelledAt,
            cancelledByUserId: appointment.cancelledByUserId,
            cancelledByRole: appointment.cancelledByRole,
            reason: appointment.cancellationReason,
            refundType: appointment.refundType,
            refundAmount: appointment.refundAmount,
          }
        : null,
    };
  }

  async updateStatus(
    appointmentId: string,
    input: UpdateAppointmentStatusInput,
    actor: AppointmentActor,
    context: RequestContext,
    now = new Date(),
  ) {
    if (input.status === "CANCELLED") return this.cancel(appointmentId, {}, actor, context, now);
    if (actor.role === "PATIENT")
      throw new ApiError(403, "Patients may only cancel scheduled appointments", "FORBIDDEN");
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, isDeleted: false },
      include: appointmentInclude,
    });
    if (!appointment) throw new ApiError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    if (actor.role === "DOCTOR" && actor.profileId !== appointment.doctorId)
      throw new ApiError(403, "Doctors can only update assigned appointments", "FORBIDDEN");
    if (!isValidAppointmentTransition(appointment.status, input.status)) {
      if (["COMPLETED", "CANCELLED"].includes(appointment.status))
        throw new ApiError(
          409,
          "Final appointment status cannot be changed",
          "APPOINTMENT_FINALIZED",
        );
      throw new ApiError(
        400,
        "Appointment status transition is invalid",
        "INVALID_STATUS_TRANSITION",
      );
    }
    if (actor.role === "DOCTOR" && !["INPROGRESS", "COMPLETED"].includes(input.status))
      throw new ApiError(403, "Doctor status transition is not allowed", "FORBIDDEN");
    const { startsAt } = appointmentWindow(appointment.schedule);
    if (input.status === "INPROGRESS" && now.getTime() < startsAt.getTime() - 15 * 60 * 1_000) {
      throw new ApiError(
        400,
        "Appointment cannot start more than 15 minutes early",
        "APPOINTMENT_TOO_EARLY",
      );
    }
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "appointments" WHERE "id" = ${appointmentId} FOR UPDATE`;
      const current = await transaction.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
      });
      if (!isValidAppointmentTransition(current.status, input.status))
        throw new ApiError(
          409,
          "Appointment status changed concurrently",
          "APPOINTMENT_STATUS_CONFLICT",
        );
      const saved = await transaction.appointment.update({
        where: { id: appointmentId },
        data: {
          status: input.status,
          ...(input.status === "INPROGRESS" ? { startedAt: now } : { completedAt: now }),
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "APPOINTMENT_STATUS_UPDATED",
          userId: actor.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            appointmentId,
            from: current.status,
            to: input.status,
          },
        },
      });
      return saved;
    });
    invalidate(appointment);
    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
  }

  async cancel(
    appointmentId: string,
    input: CancelAppointmentInput,
    actor: AppointmentActor,
    context: RequestContext,
    now = new Date(),
  ) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, isDeleted: false },
      include: appointmentInclude,
    });
    if (!appointment) throw new ApiError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    const owns =
      (actor.role === "PATIENT" && actor.profileId === appointment.patientId) ||
      (actor.role === "DOCTOR" && actor.profileId === appointment.doctorId) ||
      isAdmin(actor.role);
    if (!owns) throw new ApiError(403, "You cannot cancel this appointment", "FORBIDDEN");
    if (appointment.status !== "SCHEDULED")
      throw new ApiError(
        409,
        "Only scheduled appointments can be cancelled",
        "APPOINTMENT_NOT_CANCELLABLE",
      );
    const { startsAt } = appointmentWindow(appointment.schedule);
    const policy = calculateCancellation(
      actor.role,
      hoursUntil(startsAt, now),
      appointment.payment?.amount ?? appointment.appointmentFee,
      appointment.payment?.status ?? "PENDING",
    );

    const providerRefund =
      appointment.payment && policy.refundAmount > 0
        ? await this.payments.refund({
            paymentId: appointment.payment.id,
            appointmentId,
            stripePaymentIntentId: appointment.payment.stripePaymentIntentId,
            amount: policy.refundAmount,
            reason: input.reason,
          })
        : null;
    const cancelled = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "appointments" WHERE "id" = ${appointmentId} FOR UPDATE`;
      const current = await transaction.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
      });
      if (current.status !== "SCHEDULED")
        throw new ApiError(
          409,
          "Appointment status changed concurrently",
          "APPOINTMENT_STATUS_CONFLICT",
        );
      const saved = await transaction.appointment.update({
        where: { id: appointmentId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelledByUserId: actor.userId,
          cancelledByRole: actor.role as UserRole,
          cancellationReason: input.reason,
          refundType: policy.refundType,
          refundAmount: policy.refundAmount,
        },
      });
      await transaction.schedule.update({
        where: { id: appointment.scheduleId },
        data: { isBooked: false },
      });
      if (appointment.payment)
        await transaction.payment.update({
          where: { id: appointment.payment.id },
          data: {
            status: policy.nextPaymentStatus,
            refundAmount: policy.refundAmount,
            ...(policy.refundAmount > 0
              ? { refundedAt: now, stripeRefundId: providerRefund?.providerRefundId }
              : {}),
          },
        });
      if (appointment.payment && providerRefund)
        await transaction.refund.create({
          data: {
            paymentId: appointment.payment.id,
            stripeRefundId: providerRefund.providerRefundId,
            amount: policy.refundAmount,
            reason: input.reason,
            status: providerRefund.status,
          },
        });
      await transaction.auditLog.create({
        data: {
          action: "APPOINTMENT_CANCELLED",
          userId: actor.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            actorRole: actor.role,
            appointmentId,
            reason: input.reason,
            refundType: policy.refundType,
            refundAmount: policy.refundAmount,
          },
        },
      });
      return saved;
    });
    invalidate(appointment);
    await this.emails.sendCancelled({
      patientEmail: appointment.patient.email,
      doctorEmail: appointment.doctor.email,
      reason: input.reason,
      refundAmount: policy.refundAmount,
    });
    return {
      id: cancelled.id,
      status: cancelled.status,
      refund: {
        type: policy.refundType,
        amount: policy.refundAmount,
        processedAt: policy.refundAmount > 0 ? now : null,
      },
      cancelledBy: actor.userId,
      cancelledAt: now,
    };
  }

  async search(query: AdminAppointmentQuery, actor: AppointmentActor, context: RequestContext) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const doctorWhere: Prisma.DoctorWhereInput | undefined =
      query.doctorSearch || query.specialty
        ? {
            ...(query.doctorSearch
              ? { name: { contains: query.doctorSearch, mode: "insensitive" } }
              : {}),
            ...(query.specialty
              ? {
                  specialties: {
                    some: {
                      specialty: { title: { contains: query.specialty, mode: "insensitive" } },
                    },
                  },
                }
              : {}),
          }
        : undefined;
    const where: Prisma.AppointmentWhereInput = {
      isDeleted: false,
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.patientSearch
        ? {
            patient: {
              OR: [
                { name: { contains: query.patientSearch, mode: "insensitive" } },
                { email: { contains: query.patientSearch, mode: "insensitive" } },
              ],
            },
          }
        : {}),
      ...(doctorWhere ? { doctor: doctorWhere } : {}),
      ...(query.paymentStatus ? { payment: { status: query.paymentStatus } } : {}),
      ...(query.minFee !== undefined || query.maxFee !== undefined
        ? { appointmentFee: { gte: query.minFee, lte: query.maxFee } }
        : {}),
      ...(scheduleDateWhere(query.startDate, query.endDate)
        ? { schedule: scheduleDateWhere(query.startDate, query.endDate) }
        : {}),
    };
    const [appointments, total, groups, paid, specialtyRows] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        include: appointmentInclude,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [query.sortBy]: query.sortOrder },
      }),
      prisma.appointment.count({ where }),
      prisma.appointment.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.payment.aggregate({
        where: { appointment: where, status: { in: ["PAID", "PARTIAL_REFUND"] } },
        _sum: { amount: true, refundAmount: true },
        _avg: { amount: true },
      }),
      prisma.appointment.findMany({
        where,
        select: {
          doctor: {
            select: {
              specialties: { select: { specialty: { select: { id: true, title: true } } } },
            },
          },
        },
      }),
    ]);
    const specialtyCounts = new Map<string, { id: string; title: string; count: number }>();
    for (const row of specialtyRows) {
      for (const { specialty } of row.doctor.specialties) {
        const existing = specialtyCounts.get(specialty.id);
        specialtyCounts.set(specialty.id, { ...specialty, count: (existing?.count ?? 0) + 1 });
      }
    }
    await prisma.auditLog.create({
      data: {
        action: "APPOINTMENT_LIST_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: {
          actorUserId: actor.userId,
          adminSearch: true,
          resultCount: appointments.length,
        },
      },
    });
    return {
      appointments: appointments.map((item) => listView(item, "ADMIN")),
      analytics: {
        totalAppointments: total,
        statusBreakdown: Object.fromEntries(
          groups.map((group) => [group.status, group._count._all]),
        ),
        totalRevenue: (paid._sum.amount ?? 0) - (paid._sum.refundAmount ?? 0),
        averageFee: paid._avg.amount ?? 0,
        popularSpecialties: [...specialtyCounts.values()]
          .sort((left, right) => right.count - left.count)
          .slice(0, 10),
      },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export const appointmentService = new AppointmentService();
