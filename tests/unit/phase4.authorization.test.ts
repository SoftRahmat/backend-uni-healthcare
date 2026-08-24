import { describe, expect, it } from "vitest";

import { PatientService } from "../../src/app/module/patient/patient.service.js";

describe("Phase 4 service authorization", () => {
  it("blocks non-admin patient-list access before persistence", async () => {
    const service = new PatientService();
    await expect(
      service.list(
        {
          page: 1,
          limit: 10,
          sortBy: "createdAt",
          sortOrder: "desc",
          includeDeleted: false,
        },
        { userId: "patient-user", role: "PATIENT", profileId: "patient-profile" },
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
