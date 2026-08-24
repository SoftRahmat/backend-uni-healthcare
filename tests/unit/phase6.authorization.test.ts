import { describe, expect, it } from "vitest";

import { AppointmentService } from "../../src/app/module/appointment/appointment.service.js";

const input = {
  doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  scheduleId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  patientId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  emergency: false,
};

describe("Phase 6 service authorization", () => {
  const service = new AppointmentService();

  it("blocks doctors from booking before persistence", async () => {
    await expect(service.book(input, { userId: "doctor-user", role: "DOCTOR", profileId: input.doctorId }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("blocks cross-patient and non-admin emergency booking", async () => {
    await expect(service.book(input, { userId: "patient-user", role: "PATIENT", profileId: "other-patient" }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(service.book({ ...input, emergency: true }, { userId: "patient-user", role: "PATIENT", profileId: input.patientId }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("protects admin search and role-specific lists before persistence", async () => {
    await expect(service.search({ page: 1, limit: 20, sortBy: "createdAt", sortOrder: "desc" }, { userId: "patient", role: "PATIENT" }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(service.listDoctor(input.doctorId, { page: 1, limit: 20 }, { userId: "patient", role: "PATIENT" }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(service.listPatient(input.patientId, { page: 1, limit: 10 }, { userId: "doctor", role: "DOCTOR" }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("blocks patient status changes other than cancellation before persistence", async () => {
    await expect(service.updateStatus("appointment", { status: "COMPLETED" }, { userId: "patient", role: "PATIENT" }, {}))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
