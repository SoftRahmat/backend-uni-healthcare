import { describe, expect, it } from "vitest";

import {
  adminAppointmentQuerySchema,
  bookAppointmentSchema,
  doctorAppointmentQuerySchema,
  patientAppointmentQuerySchema,
  updateAppointmentStatusSchema,
} from "../../src/app/module/appointment/appointment.validation.js";

const ids = {
  doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  scheduleId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  patientId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
};

describe("Phase 6 appointment contracts", () => {
  it("validates booking IDs, notes, and emergency flag", () => {
    expect(bookAppointmentSchema.parse(ids)).toMatchObject({ ...ids, emergency: false });
    expect(bookAppointmentSchema.safeParse({ ...ids, doctorId: "invalid" }).success).toBe(false);
    expect(bookAppointmentSchema.safeParse({ ...ids, notes: "x".repeat(1001) }).success).toBe(false);
  });

  it("supports multiple patient statuses and strict pagination", () => {
    const parsed = patientAppointmentQuerySchema.parse({ status: "SCHEDULED,COMPLETED" });
    expect(parsed).toMatchObject({ page: 1, limit: 10, status: ["SCHEDULED", "COMPLETED"] });
    expect(patientAppointmentQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(patientAppointmentQuerySchema.safeParse({ upcoming: "maybe" }).success).toBe(false);
  });

  it("validates doctor filters and date ranges", () => {
    expect(doctorAppointmentQuerySchema.parse({ date: "2026-09-01" })).toMatchObject({ page: 1, limit: 20 });
    expect(doctorAppointmentQuerySchema.safeParse({ startDate: "2026-09-02", endDate: "2026-09-01" }).success).toBe(false);
    expect(doctorAppointmentQuerySchema.safeParse({ paymentStatus: "UNKNOWN" }).success).toBe(false);
  });

  it("validates combined admin filters and fee ranges", () => {
    expect(adminAppointmentQuerySchema.safeParse({ minFee: "100", maxFee: "500", specialty: "Cardiology" }).success).toBe(true);
    expect(adminAppointmentQuerySchema.safeParse({ minFee: "500", maxFee: "100" }).success).toBe(false);
    expect(adminAppointmentQuerySchema.safeParse({ sortBy: "password" }).success).toBe(false);
  });

  it("accepts only lifecycle statuses", () => {
    expect(updateAppointmentStatusSchema.safeParse({ status: "INPROGRESS" }).success).toBe(true);
    expect(updateAppointmentStatusSchema.safeParse({ status: "NO_SHOW" }).success).toBe(false);
  });
});
