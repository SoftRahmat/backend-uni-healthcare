import { Router } from "express";

import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  accessMedicalReport,
  deleteMedicalReport,
  listMedicalReports,
  uploadMedicalReport,
} from "./medicalReport.controller.js";
import { uploadMedicalReportFile } from "./medicalReport-upload.middleware.js";
import {
  medicalReportListQuerySchema,
  medicalReportParamsSchema,
  uploadMedicalReportSchema,
} from "./medicalReport.validation.js";

export const medicalReportRouter = Router({ mergeParams: true });

medicalReportRouter.post(
  "/",
  authorizeExact("PATIENT"),
  uploadMedicalReportFile,
  validate({ params: medicalReportParamsSchema, body: uploadMedicalReportSchema }),
  uploadMedicalReport,
);
medicalReportRouter.get(
  "/",
  authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR", "PATIENT"),
  validate({ params: medicalReportParamsSchema, query: medicalReportListQuerySchema }),
  listMedicalReports,
);
medicalReportRouter.get(
  "/:reportId/access",
  authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR", "PATIENT"),
  validate({ params: medicalReportParamsSchema }),
  accessMedicalReport,
);
medicalReportRouter.delete(
  "/:reportId",
  authorizeExact("SUPER_ADMIN", "ADMIN", "PATIENT"),
  validate({ params: medicalReportParamsSchema }),
  deleteMedicalReport,
);
