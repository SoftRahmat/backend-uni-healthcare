import { describe, expect, it } from "vitest";

import {
  patientHealthDataSchema,
  patientListQuerySchema,
  updatePatientSchema,
} from "../../src/app/module/patient/patient.validation.js";
import {
  medicalReportListQuerySchema,
  uploadMedicalReportSchema,
} from "../../src/app/module/medicalReport/medicalReport.validation.js";

const yearsAgo = (years: number): string => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
};

describe("Phase 4 patient contracts", () => {
  it("allows owned profile fields but rejects email and role changes", () => {
    expect(updatePatientSchema.safeParse({ name: "Updated Patient" }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ email: "new@example.com" }).success).toBe(false);
    expect(updatePatientSchema.safeParse({ role: "ADMIN" }).success).toBe(false);
  });

  it("enforces pagination defaults, limits, and date ranges", () => {
    expect(patientListQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    expect(patientListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(patientListQuerySchema.safeParse({ includeDeleted: "not-a-boolean" }).success).toBe(
      false,
    );
    expect(
      patientListQuerySchema.safeParse({ createdFrom: "2026-02-01", createdTo: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("validates health ages, measurements, paired BMI inputs, and enums", () => {
    const valid = {
      dateOfBirth: yearsAgo(30),
      gender: "FEMALE",
      heightCm: 175,
      weightKg: 70,
      bloodGroup: "A_POSITIVE",
    };
    expect(patientHealthDataSchema.safeParse(valid).success).toBe(true);
    expect(patientHealthDataSchema.safeParse({ ...valid, dateOfBirth: yearsAgo(17) }).success).toBe(
      false,
    );
    expect(
      patientHealthDataSchema.safeParse({ ...valid, dateOfBirth: yearsAgo(121) }).success,
    ).toBe(false);
    expect(patientHealthDataSchema.safeParse({ ...valid, heightCm: 49 }).success).toBe(false);
    expect(patientHealthDataSchema.safeParse({ ...valid, weightKg: undefined }).success).toBe(
      false,
    );
    expect(patientHealthDataSchema.safeParse({ ...valid, bloodGroup: "UNKNOWN" }).success).toBe(
      false,
    );
  });
});

describe("Phase 4 medical report contracts", () => {
  it("validates metadata and report type", () => {
    expect(
      uploadMedicalReportSchema.safeParse({ reportName: "Blood test", reportType: "LAB_TEST" })
        .success,
    ).toBe(true);
    expect(
      uploadMedicalReportSchema.safeParse({ reportName: "x", reportType: "LAB_TEST" }).success,
    ).toBe(false);
    expect(
      uploadMedicalReportSchema.safeParse({ reportName: "Blood test", reportType: "UNKNOWN" })
        .success,
    ).toBe(false);
  });

  it("validates report pagination and date filters", () => {
    expect(medicalReportListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 10 });
    expect(medicalReportListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(
      medicalReportListQuerySchema.safeParse({ createdFrom: "2026-02-01", createdTo: "2026-01-01" })
        .success,
    ).toBe(false);
  });
});
