import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { medicalReportRouter } from "../medicalReport/medicalReport.routes.js";
import {
  getOwnPatient,
  getPatient,
  listPatients,
  savePatientHealthData,
  updateOwnPatient,
  updatePatient,
} from "./patient.controller.js";
import {
  patientHealthDataSchema,
  patientIdParamsSchema,
  patientListQuerySchema,
  updatePatientSchema,
} from "./patient.validation.js";

export const patientRouter = Router();

patientRouter.use(authenticate);
patientRouter.get("/", authorizeExact("SUPER_ADMIN", "ADMIN"), validate({ query: patientListQuerySchema }), listPatients);
patientRouter.get("/me", authorizeExact("PATIENT"), getOwnPatient);
patientRouter.patch("/me", authorizeExact("PATIENT"), validate({ body: updatePatientSchema }), updateOwnPatient);
patientRouter.get("/:patientId", validate({ params: patientIdParamsSchema }), getPatient);
patientRouter.patch(
  "/:patientId", authorizeExact("SUPER_ADMIN", "ADMIN", "PATIENT"),
  validate({ params: patientIdParamsSchema, body: updatePatientSchema }), updatePatient,
);
patientRouter.put(
  "/:patientId/health-data", authorizeExact("PATIENT"),
  validate({ params: patientIdParamsSchema, body: patientHealthDataSchema }), savePatientHealthData,
);
patientRouter.use("/:patientId/medical-reports", medicalReportRouter);
