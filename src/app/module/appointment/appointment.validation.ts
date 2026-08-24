import { z } from "zod";

const statuses = ["SCHEDULED", "INPROGRESS", "COMPLETED", "CANCELLED"] as const;
const paymentStatuses = ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIAL_REFUND"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date is invalid");
const strictBoolean = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());
const statusArray = z.preprocess((value) => {
  if (typeof value === "string") return value.split(",").filter(Boolean);
  return value;
}, z.array(z.enum(statuses)).max(statuses.length).transform((items) => [...new Set(items)]).optional());

export const bookAppointmentSchema = z.object({
  doctorId: z.uuid(),
  scheduleId: z.uuid(),
  patientId: z.uuid(),
  notes: z.string().trim().max(1000).optional(),
  emergency: z.boolean().default(false),
}).strict();

const commonListFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100),
  status: statusArray,
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
};
const dateRangeValid = (value: { startDate?: string; endDate?: string }) =>
  !value.startDate || !value.endDate || value.startDate <= value.endDate;

export const patientAppointmentQuerySchema = z.object({
  ...commonListFields,
  limit: commonListFields.limit.default(10),
  upcoming: strictBoolean.optional(),
}).strict().refine(dateRangeValid, "Start date cannot be after end date");

export const doctorAppointmentQuerySchema = z.object({
  ...commonListFields,
  limit: commonListFields.limit.default(20),
  date: isoDate.optional(),
  patientSearch: z.string().trim().max(100).optional(),
  paymentStatus: z.enum(paymentStatuses).optional(),
}).strict().refine(dateRangeValid, "Start date cannot be after end date");

export const adminAppointmentQuerySchema = z.object({
  ...commonListFields,
  limit: commonListFields.limit.default(20),
  patientSearch: z.string().trim().max(100).optional(),
  doctorSearch: z.string().trim().max(100).optional(),
  paymentStatus: z.enum(paymentStatuses).optional(),
  specialty: z.string().trim().max(100).optional(),
  minFee: z.coerce.number().int().min(0).optional(),
  maxFee: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(["createdAt", "appointmentFee", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine(dateRangeValid, "Start date cannot be after end date")
  .refine((value) => value.minFee === undefined || value.maxFee === undefined || value.minFee <= value.maxFee, {
    message: "Minimum fee cannot exceed maximum fee",
  });

export const updateAppointmentStatusSchema = z.object({ status: z.enum(statuses) }).strict();
export const cancelAppointmentSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();
export const appointmentIdParamsSchema = z.object({ appointmentId: z.uuid() });
export const patientAppointmentParamsSchema = z.object({ patientId: z.uuid() });
export const doctorAppointmentParamsSchema = z.object({ doctorId: z.uuid() });

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type PatientAppointmentQuery = z.infer<typeof patientAppointmentQuerySchema>;
export type DoctorAppointmentQuery = z.infer<typeof doctorAppointmentQuerySchema>;
export type AdminAppointmentQuery = z.infer<typeof adminAppointmentQuerySchema>;
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
