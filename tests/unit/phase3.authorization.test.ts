import { describe, expect, it } from "vitest";

import { DoctorService } from "../../src/app/module/doctor/doctor.service.js";
import { SpecialtyService } from "../../src/app/module/specialty/specialty.service.js";

describe("Phase 3 service authorization", () => {
  it("blocks patients from doctor creation before persistence", async () => {
    const service = new DoctorService({
      sendWelcome: async () => undefined,
      sendDeactivation: async () => undefined,
    });
    await expect(
      service.create(
        {} as never,
        {
          userId: "patient-user",
          role: "PATIENT",
        },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("blocks non-admin specialty mutation before persistence", async () => {
    const service = new SpecialtyService();
    await expect(
      service.create(
        { title: "Cardiology" },
        {
          userId: "doctor-user",
          role: "DOCTOR",
        },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(
      service.delete(
        "specialty-id",
        {
          userId: "admin-user",
          role: "ADMIN",
        },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
