import { z } from "zod";

export const reviewIdParamsSchema = z.object({ reviewId: z.uuid() });
export const doctorReviewParamsSchema = z.object({ doctorId: z.uuid() });
export const patientReviewParamsSchema = z.object({ patientId: z.uuid() });
export const createReviewSchema = z.object({
  appointmentId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  displayAnonymous: z.boolean().default(true),
});
export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).nullable().optional(),
    displayAnonymous: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    "At least one review field is required",
  );
export const deleteReviewSchema = z.object({
  reason: z.string().trim().min(5).max(500).optional(),
});
export const doctorResponseSchema = z.object({ response: z.string().trim().min(2).max(500) });
export const doctorReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  verifiedOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  sortBy: z.enum(["rating", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export const patientReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type DoctorReviewQuery = z.infer<typeof doctorReviewQuerySchema>;
export type PatientReviewQuery = z.infer<typeof patientReviewQuerySchema>;
