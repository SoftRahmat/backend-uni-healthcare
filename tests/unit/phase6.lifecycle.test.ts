import { describe, expect, it } from "vitest";

import {
  calculateCancellation,
  isValidAppointmentTransition,
} from "../../src/app/module/appointment/appointment.service.js";
import { DeferredStripePaymentGateway } from "../../src/app/module/appointment/appointment-payment.service.js";
import {
  appointmentWindow,
  zonedScheduleInstant,
} from "../../src/app/module/appointment/appointment-time.service.js";
import { AppointmentVideoService } from "../../src/app/module/appointment/appointment-video.service.js";

describe("Phase 6 appointment lifecycle policies", () => {
  it("enforces the status transition matrix", () => {
    expect(isValidAppointmentTransition("SCHEDULED", "INPROGRESS")).toBe(true);
    expect(isValidAppointmentTransition("SCHEDULED", "CANCELLED")).toBe(true);
    expect(isValidAppointmentTransition("INPROGRESS", "COMPLETED")).toBe(true);
    expect(isValidAppointmentTransition("COMPLETED", "SCHEDULED")).toBe(false);
    expect(isValidAppointmentTransition("CANCELLED", "SCHEDULED")).toBe(false);
  });

  it("applies full, partial, and no-refund tiers", () => {
    expect(calculateCancellation("PATIENT", 30, 500, "PAID")).toMatchObject({
      refundType: "FULL",
      refundAmount: 500,
      nextPaymentStatus: "REFUNDED",
    });
    expect(calculateCancellation("DOCTOR", 18, 500, "PAID")).toMatchObject({
      refundType: "PARTIAL",
      refundAmount: 250,
      nextPaymentStatus: "PARTIAL_REFUND",
    });
    expect(calculateCancellation("ADMIN", 6, 500, "PAID")).toMatchObject({
      refundType: "NONE",
      refundAmount: 0,
      nextPaymentStatus: "PAID",
    });
    expect(calculateCancellation("ADMIN", 30, 500, "PENDING")).toMatchObject({
      refundAmount: 0,
      nextPaymentStatus: "FAILED",
    });
  });

  it("enforces patient and doctor cancellation cutoffs", () => {
    expect(() => calculateCancellation("PATIENT", 23.9, 500, "PAID")).toThrowError(/24 hours/);
    expect(() => calculateCancellation("DOCTOR", 11.9, 500, "PAID")).toThrowError(/12 hours/);
  });

  it("converts configured local schedule times into exact instants", () => {
    expect(zonedScheduleInstant("2026-09-01", "09:00", "Asia/Singapore").toISOString()).toBe(
      "2026-09-01T01:00:00.000Z",
    );
    const window = appointmentWindow({
      scheduleDate: "2026-09-01",
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(window.endsAt.getTime()).toBeGreaterThan(window.startsAt.getTime());
  });

  it("creates a 30-minute untamperable payment shell", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const payment = new DeferredStripePaymentGateway().pending({
      paymentId: "payment",
      appointmentId: "appointment",
      amount: 500,
      patientId: "patient",
      now,
    });
    expect(payment.amount).toBe(500);
    expect(payment.status).toBe("PENDING");
    expect(payment.expiresAt.toISOString()).toBe("2026-09-01T00:30:00.000Z");
  });

  it("exposes signed video links only from 15 minutes before through one hour after", async () => {
    const video = new AppointmentVideoService();
    const appointment = {
      id: "appointment-id",
      videoCallingId: "meeting-id",
      schedule: {
        scheduleDate: new Date("2026-09-01T00:00:00.000Z"),
        startTime: "09:00",
        endTime: "10:00",
      },
    };
    const actor = { userId: "patient-user", role: "PATIENT" as const };
    const { startsAt, endsAt } = appointmentWindow(appointment.schedule);
    await expect(
      video.accessLink(appointment, actor, new Date(startsAt.getTime() - 16 * 60 * 1000)),
    ).resolves.toBeNull();
    await expect(
      video.accessLink(appointment, actor, new Date(startsAt.getTime() - 15 * 60 * 1000)),
    ).resolves.toMatch(/^http/);
    await expect(
      video.accessLink(appointment, actor, new Date(endsAt.getTime() + 60 * 60 * 1000)),
    ).resolves.toBeNull();
  });
});
