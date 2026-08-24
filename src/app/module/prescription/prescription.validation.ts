import { z } from "zod";

const medicineSchema = z.object({
  name: z.string().trim().min(2).max(200),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(500).optional(),
});
const futureDate = z.iso
  .date()
  .refine(
    (value) => new Date(`${value}T23:59:59.999Z`) > new Date(),
    "Follow-up date must be in the future",
  );
export const prescriptionIdParamsSchema = z.object({ prescriptionId: z.uuid() });
export const doctorPrescriptionParamsSchema = z.object({ doctorId: z.uuid() });
export const patientPrescriptionParamsSchema = z.object({ patientId: z.uuid() });
export const createPrescriptionSchema = z.object({
  appointmentId: z.uuid(),
  instructions: z.string().trim().min(10).max(5000),
  followUpDate: futureDate.optional(),
  medicines: z.array(medicineSchema).max(50).default([]),
});
export const updatePrescriptionSchema = z
  .object({
    instructions: z.string().trim().min(10).max(5000).optional(),
    followUpDate: futureDate.nullable().optional(),
    medicines: z.array(medicineSchema).max(50).optional(),
    overrideReason: z.string().trim().min(10).max(500).optional(),
  })
  .refine(
    (value) =>
      value.instructions !== undefined ||
      value.followUpDate !== undefined ||
      value.medicines !== undefined,
    "At least one prescription field is required",
  );
export const prescriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  doctorId: z.uuid().optional(),
  specialty: z.string().trim().min(1).max(100).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  search: z.string().trim().min(2).max(100).optional(),
  sortBy: z.enum(["createdAt", "followUpDate", "doctorName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export const verifyPrescriptionQuerySchema = z.object({
  token: z.string().min(32).max(200),
  version: z.coerce.number().int().positive(),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;
