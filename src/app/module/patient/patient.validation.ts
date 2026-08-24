import { z } from "zod";

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, "Contact number is invalid");
const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

export const patientIdParamsSchema = z.object({ patientId: z.uuid() });

export const updatePatientSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  contactNumber: phoneSchema.optional(),
  address: z.string().trim().max(500).optional(),
  profilePhoto: z.url().max(2048).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one update is required");

export const patientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  searchTerm: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  status: z.enum(["ACTIVE", "BLOCKED", "DELETED"]).optional(),
  createdFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  createdTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  includeDeleted: z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean()).default(false),
}).refine((value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo, {
  message: "Created-from date cannot be after created-to date",
});

const dateOfBirthSchema = z.coerce.date().refine((date) => {
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < date.getUTCMonth()
    || (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 18 && age <= 120;
}, "Patient age must be between 18 and 120 years");

export const patientHealthDataSchema = z.object({
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  bloodGroup: z.enum(["A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE", "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"]).optional(),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"]).optional(),
  heightCm: z.number().min(50).max(250).optional(),
  weightKg: z.number().min(20).max(300).optional(),
  allergies: z.string().trim().max(1000).optional(),
  chronicConditions: z.string().trim().max(1000).optional(),
  currentMedications: z.string().trim().max(1000).optional(),
  familyMedicalHistory: z.string().trim().max(2000).optional(),
  emergencyContactName: z.string().trim().min(2).max(100).optional(),
  emergencyContactPhone: phoneSchema.optional(),
  smokingStatus: z.boolean().nullable().optional(),
  alcoholConsumption: z.boolean().nullable().optional(),
  dietaryPreferences: z.string().trim().max(500).optional(),
}).strict().refine((value) => (value.heightCm === undefined) === (value.weightKg === undefined), {
  message: "Height and weight must be supplied together to calculate BMI",
});

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
export type PatientHealthDataInput = z.infer<typeof patientHealthDataSchema>;
