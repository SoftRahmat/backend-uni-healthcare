import { z } from "zod";

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;

export const medicalReportParamsSchema = z.object({
  patientId: z.uuid(),
  reportId: z.uuid().optional(),
});

export const uploadMedicalReportSchema = z.object({
  reportName: z.string().trim().min(2).max(200),
  reportType: z.enum(["LAB_TEST", "IMAGING", "PRESCRIPTION", "DISCHARGE_SUMMARY", "OTHER"]),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
}).strict();

export const medicalReportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  reportType: z.enum(["LAB_TEST", "IMAGING", "PRESCRIPTION", "DISCHARGE_SUMMARY", "OTHER"]).optional(),
  createdFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  createdTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
}).refine((value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo, {
  message: "Created-from date cannot be after created-to date",
});

export type UploadMedicalReportInput = z.infer<typeof uploadMedicalReportSchema>;
export type MedicalReportListQuery = z.infer<typeof medicalReportListQuerySchema>;
