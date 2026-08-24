import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  adminPrescriptionDashboard,
  createPrescription,
  doctorPrescriptionStatistics,
  downloadPrescription,
  getPrescription,
  listPatientPrescriptions,
  updatePrescription,
  verifyPrescription,
} from "./prescription.controller.js";
import {
  createPrescriptionSchema,
  doctorPrescriptionParamsSchema,
  patientPrescriptionParamsSchema,
  prescriptionIdParamsSchema,
  prescriptionListQuerySchema,
  updatePrescriptionSchema,
  verifyPrescriptionQuerySchema,
} from "./prescription.validation.js";

export const prescriptionRouter = Router();
prescriptionRouter.get(
  "/:prescriptionId/verify",
  validate({ params: prescriptionIdParamsSchema, query: verifyPrescriptionQuerySchema }),
  verifyPrescription,
);
prescriptionRouter.use(authenticate);
prescriptionRouter.post(
  "/",
  authorizeExact("DOCTOR"),
  validate({ body: createPrescriptionSchema }),
  createPrescription,
);
prescriptionRouter.get(
  "/admin/dashboard",
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  adminPrescriptionDashboard,
);
prescriptionRouter.get(
  "/doctor/:doctorId/statistics",
  authorizeExact("DOCTOR", "ADMIN", "SUPER_ADMIN"),
  validate({ params: doctorPrescriptionParamsSchema }),
  doctorPrescriptionStatistics,
);
prescriptionRouter.get(
  "/patient/:patientId",
  authorizeExact("PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"),
  validate({ params: patientPrescriptionParamsSchema, query: prescriptionListQuerySchema }),
  listPatientPrescriptions,
);
prescriptionRouter.get(
  "/:prescriptionId",
  validate({ params: prescriptionIdParamsSchema }),
  getPrescription,
);
prescriptionRouter.get(
  "/:prescriptionId/pdf",
  validate({ params: prescriptionIdParamsSchema }),
  downloadPrescription,
);
prescriptionRouter.patch(
  "/:prescriptionId",
  authorizeExact("DOCTOR", "ADMIN", "SUPER_ADMIN"),
  validate({ params: prescriptionIdParamsSchema, body: updatePrescriptionSchema }),
  updatePrescription,
);
