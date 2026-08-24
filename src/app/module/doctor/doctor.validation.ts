import { z } from "zod";

import { passwordSchema } from "../auth/auth.validation.js";

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, "Contact number is invalid");
const specialtyIdsSchema = z.array(z.uuid()).max(20).transform((ids) => [...new Set(ids)]);

export const createDoctorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320),
  password: passwordSchema,
  contactNumber: phoneSchema,
  address: z.string().trim().max(500).optional(),
  registrationNumber: z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9]+$/),
  experience: z.number().int().min(0).max(70),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  appointmentFee: z.number().int().min(100).max(1_000_000),
  qualification: z.string().trim().min(2).max(200),
  currentWorkingPlace: z.string().trim().min(2).max(200),
  designation: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(1000).optional(),
  profilePhoto: z.url().max(2048).optional(),
  specialtyIds: specialtyIdsSchema.optional(),
}).strict();

export const updateDoctorSchema = createDoctorSchema.omit({
  password: true,
  registrationNumber: true,
}).partial().extend({
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one update is required");

const arrayQuery = z.preprocess((value) => {
  if (typeof value === "string") return value.split(",").filter(Boolean);
  return value;
}, specialtyIdsSchema.optional());

export const doctorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  searchTerm: z.string().trim().max(100).optional(),
  specialtyIds: arrayQuery,
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  minExperience: z.coerce.number().int().min(0).max(70).optional(),
  maxExperience: z.coerce.number().int().min(0).max(70).optional(),
  minFee: z.coerce.number().int().min(0).optional(),
  maxFee: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(["averageRating", "appointmentFee", "experience", "name"]).default("averageRating"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine((value) => value.minExperience === undefined || value.maxExperience === undefined || value.minExperience <= value.maxExperience, {
  message: "Minimum experience cannot exceed maximum experience",
}).refine((value) => value.minFee === undefined || value.maxFee === undefined || value.minFee <= value.maxFee, {
  message: "Minimum fee cannot exceed maximum fee",
});

export const doctorIdParamsSchema = z.object({ doctorId: z.uuid() });
export const deleteDoctorSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  force: z.boolean().default(false),
}).strict();

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;
export type DeleteDoctorInput = z.infer<typeof deleteDoctorSchema>;
