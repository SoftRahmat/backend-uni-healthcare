import { z } from "zod";

const iconSchema = z.string().trim().max(500).refine((value) => {
  if (z.url().safeParse(value).success) return true;
  return /^\p{Extended_Pictographic}/u.test(value);
}, "Icon must be a valid URL or emoji");

export const createSpecialtySchema = z.object({
  title: z.string().trim().min(2).max(100),
  icon: iconSchema.optional(),
  description: z.string().trim().max(1000).optional(),
}).strict();

export const updateSpecialtySchema = createSpecialtySchema.partial()
  .refine((value) => Object.keys(value).length > 0, "At least one update is required");

export const specialtyIdParamsSchema = z.object({ specialtyId: z.uuid() });

export const specialtyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  searchTerm: z.string().trim().max(100).optional(),
});

export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>;
export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>;
export type SpecialtyListQuery = z.infer<typeof specialtyListQuerySchema>;
