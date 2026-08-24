import { z } from "zod";

import { passwordSchema } from "../auth/auth.validation.js";

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, "Contact number is invalid");
const profilePhotoSchema = z.url().max(2048);

export const createAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(320),
  password: passwordSchema,
  contactNumber: phoneSchema.optional(),
  profilePhoto: profilePhotoSchema.optional(),
}).strict();

export const updateAdminSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.email().max(320).optional(),
  contactNumber: phoneSchema.nullable().optional(),
  profilePhoto: profilePhotoSchema.nullable().optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one update is required");

const booleanQuery = z.preprocess(
  (value) => value === "true" ? true : value === "false" ? false : value,
  z.boolean(),
);

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  searchTerm: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  role: z.enum(["ADMIN", "SUPER_ADMIN"]).optional(),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  includeDeleted: booleanQuery.default(false),
});

export const adminIdParamsSchema = z.object({ adminId: z.string().min(1) });

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
