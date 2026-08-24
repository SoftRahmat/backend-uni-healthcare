import { logger } from "../../config/logger.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import { AppointmentEmailService } from "./appointment-email.service.js";
import { appointmentWindow } from "./appointment-time.service.js";

export const processAppointmentLifecycle = async (
  now = new Date(),
  emails = new AppointmentEmailService(),
): Promise<{
  paymentExpired: number;
  autoCompleted: number;
}> => {
  const expired = await prisma.appointment.findMany({
    where: {
      isDeleted: false,
      status: "SCHEDULED",
      payment: { status: "PENDING", expiresAt: { lte: now } },
    },
    select: {
      id: true,
      scheduleId: true,
      patientId: true,
      doctorId: true,
      patient: { select: { userId: true, email: true } },
      doctor: { select: { email: true } },
    },
    take: 100,
  });
  let paymentExpired = 0;
  for (const appointment of expired) {
    const changed = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "appointments" WHERE "id" = ${appointment.id} FOR UPDATE`;
      const current = await transaction.appointment.findUnique({
        where: { id: appointment.id },
        include: { payment: true },
      });
      if (
        !current ||
        current.status !== "SCHEDULED" ||
        current.payment?.status !== "PENDING" ||
        current.payment.expiresAt > now
      )
        return false;
      await transaction.appointment.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: "Payment expired",
        },
      });
      await transaction.payment.update({
        where: { id: current.payment.id },
        data: { status: "FAILED" },
      });
      await transaction.schedule.update({
        where: { id: current.scheduleId },
        data: { isBooked: false },
      });
      await transaction.auditLog.create({
        data: {
          action: "APPOINTMENT_PAYMENT_EXPIRED",
          userId: appointment.patient.userId,
          metadata: { appointmentId: current.id, scheduleId: current.scheduleId },
        },
      });
      return true;
    });
    if (changed) {
      paymentExpired += 1;
      applicationCache.deleteByPrefix(
        `appointments:patient:${appointment.patientId}:`,
        `appointments:doctor:${appointment.doctorId}:`,
        `schedules:doctor:${appointment.doctorId}:`,
        `doctor:${appointment.doctorId}`,
        "appointments:admin:",
      );
      await emails
        .sendCancelled({
          patientEmail: appointment.patient.email,
          doctorEmail: appointment.doctor.email,
          reason: "Payment expired",
          refundAmount: 0,
        })
        .catch((error: unknown) =>
          logger.error("Payment expiry notification failed", {
            appointmentId: appointment.id,
            error,
          }),
        );
    }
  }

  const candidates = await prisma.appointment.findMany({
    where: { isDeleted: false, status: { in: ["SCHEDULED", "INPROGRESS"] } },
    include: { schedule: true },
    take: 200,
  });
  let autoCompleted = 0;
  for (const appointment of candidates) {
    const { endsAt } = appointmentWindow(appointment.schedule);
    const threshold =
      appointment.status === "INPROGRESS"
        ? appointment.startedAt && new Date(appointment.startedAt.getTime() + 24 * 60 * 60 * 1_000)
        : new Date(endsAt.getTime() + 24 * 60 * 60 * 1_000);
    if (!threshold || threshold > now) continue;
    const updated = await prisma.appointment.updateMany({
      where: { id: appointment.id, status: appointment.status },
      data: { status: "COMPLETED", completedAt: now },
    });
    if (updated.count) {
      autoCompleted += 1;
      applicationCache.deleteByPrefix(
        `appointment:${appointment.id}:`,
        `appointments:patient:${appointment.patientId}:`,
        `appointments:doctor:${appointment.doctorId}:`,
        "appointments:admin:",
      );
      await prisma.auditLog.create({
        data: {
          action: "APPOINTMENT_AUTO_COMPLETED",
          metadata: { appointmentId: appointment.id, previousStatus: appointment.status },
        },
      });
    }
  }
  if (paymentExpired || autoCompleted)
    logger.info("Appointment lifecycle cleanup completed", { paymentExpired, autoCompleted });
  return { paymentExpired, autoCompleted };
};
