import { z } from "zod";

const uuid = z.uuid();
const date = z.iso.date();
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const paymentIdParamsSchema = z.object({ paymentId: uuid });
export const patientPaymentParamsSchema = z.object({ patientId: uuid });
export const doctorPaymentParamsSchema = z.object({ doctorId: uuid });
export const paymentHistoryQuerySchema = z.object({
  page,
  limit,
  status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIAL_REFUND"]).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
});
export const paymentExportQuerySchema = paymentHistoryQuerySchema.extend({
  format: z.enum(["csv", "pdf"]).default("csv"),
});
export const refundPaymentSchema = z.object({
  amount: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(500),
});
export const adminPaymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RETRY"), justification: z.string().trim().min(10).max(500) }),
  z.object({
    action: z.literal("MARK_PAID"),
    justification: z.string().trim().min(10).max(500),
    transactionId: z.string().trim().min(3).max(255),
  }),
  z.object({
    action: z.literal("ADD_NOTE"),
    justification: z.string().trim().min(10).max(500),
    notes: z.string().trim().min(1).max(1000),
  }),
]);
export const adminPaymentDashboardQuerySchema = z.object({
  startDate: date.optional(),
  endDate: date.optional(),
});

export type PaymentHistoryQuery = z.infer<typeof paymentHistoryQuerySchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type AdminPaymentActionInput = z.infer<typeof adminPaymentActionSchema>;
export type AdminPaymentDashboardQuery = z.infer<typeof adminPaymentDashboardQuerySchema>;
