import { describe, expect, it } from "vitest";

import { verifyPrescriptionToken } from "../../src/app/module/prescription/prescription-document.service.js";
import {
  createPrescriptionSchema,
  prescriptionListQuerySchema,
  updatePrescriptionSchema,
} from "../../src/app/module/prescription/prescription.validation.js";

describe("Phase 8 prescription contracts", () => {
  it("requires completed-payload quality fields and validates medicine details", () => {
    expect(() =>
      createPrescriptionSchema.parse({ appointmentId: "bad", instructions: "short" }),
    ).toThrow();
    const parsed = createPrescriptionSchema.parse({
      appointmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      instructions: "Take all medicines exactly as directed.",
      medicines: [
        { name: "Example medicine", dosage: "10 mg", frequency: "Twice daily", duration: "7 days" },
      ],
    });
    expect(parsed.medicines).toHaveLength(1);
  });

  it("requires at least one editable field and validates admin override shape", () => {
    expect(() =>
      updatePrescriptionSchema.parse({ overrideReason: "Administrative correction requested" }),
    ).toThrow();
    expect(
      updatePrescriptionSchema.parse({
        instructions: "Updated medication instructions for the patient.",
      }).instructions,
    ).toContain("Updated");
  });

  it("bounds pagination and supports prescription filters", () => {
    expect(
      prescriptionListQuerySchema.parse({ page: "2", limit: "50", sortBy: "doctorName" }),
    ).toMatchObject({ page: 2, limit: 50, sortBy: "doctorName" });
    expect(() => prescriptionListQuerySchema.parse({ limit: 51 })).toThrow();
  });

  it("rejects forged QR verification tokens", () => {
    expect(verifyPrescriptionToken("prescription", 1, "0".repeat(64))).toBe(false);
    expect(verifyPrescriptionToken("prescription", 2, "0".repeat(64))).toBe(false);
  });
});
