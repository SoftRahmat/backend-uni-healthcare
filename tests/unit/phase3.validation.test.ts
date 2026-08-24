import { describe, expect, it } from "vitest";

import {
  createDoctorSchema,
  doctorListQuerySchema,
  updateDoctorSchema,
} from "../../src/app/module/doctor/doctor.validation.js";
import {
  createSpecialtySchema,
  specialtyListQuerySchema,
} from "../../src/app/module/specialty/specialty.validation.js";

const validDoctor = {
  name: "Dr. Jane Smith",
  email: "doctor@example.com",
  password: "Strong!Password1",
  contactNumber: "+12345678901",
  registrationNumber: "BM123456",
  experience: 10,
  gender: "FEMALE",
  appointmentFee: 5000,
  qualification: "MBBS, MD",
  currentWorkingPlace: "City Hospital",
  designation: "Senior Cardiologist",
};

describe("doctor contracts", () => {
  it("accepts the required medical and financial profile", () => {
    expect(createDoctorSchema.safeParse(validDoctor).success).toBe(true);
  });

  it.each([
    { experience: -1 },
    { experience: 71 },
    { appointmentFee: 99 },
    { appointmentFee: 1_000_001 },
    { registrationNumber: "invalid number" },
  ])("rejects invalid doctor constraints: %o", (change) => {
    expect(createDoctorSchema.safeParse({ ...validDoctor, ...change }).success).toBe(false);
  });

  it("rejects immutable registration and calculated rating updates", () => {
    expect(updateDoctorSchema.safeParse({ registrationNumber: "NEW123" }).success).toBe(false);
    expect(updateDoctorSchema.safeParse({ averageRating: 5 }).success).toBe(false);
    expect(updateDoctorSchema.safeParse({ totalReviews: 100 }).success).toBe(false);
  });

  it("validates filter ranges and list limits", () => {
    expect(doctorListQuerySchema.safeParse({ minExperience: "20", maxExperience: "10" }).success)
      .toBe(false);
    expect(doctorListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(doctorListQuerySchema.parse({ specialtyIds: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }).specialtyIds)
      .toHaveLength(1);
  });
});

describe("specialty contracts", () => {
  it("accepts URL and emoji icons", () => {
    expect(createSpecialtySchema.safeParse({ title: "Cardiology", icon: "🫀" }).success).toBe(true);
    expect(createSpecialtySchema.safeParse({ title: "Neurology", icon: "https://example.com/icon.png" }).success)
      .toBe(true);
  });

  it("rejects invalid titles/icons and excessive pagination", () => {
    expect(createSpecialtySchema.safeParse({ title: "A", icon: "plain text" }).success).toBe(false);
    expect(specialtyListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
