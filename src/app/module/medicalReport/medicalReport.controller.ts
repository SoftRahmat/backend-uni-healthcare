import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { PatientActor } from "../patient/patient.service.js";
import { medicalReportService } from "./medicalReport.service.js";
import {
  medicalReportListQuerySchema,
  uploadMedicalReportSchema,
} from "./medicalReport.validation.js";

const actorFrom = (request: Request): PatientActor => {
  if (!request.auth) throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { userId: request.auth.userId, role: request.auth.role, profileId: request.auth.profileId };
};
const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const uploadMedicalReport = asyncHandler(async (request, response) => {
  const report = await medicalReportService.upload(
    String(request.params.patientId), uploadMedicalReportSchema.parse(request.body), request.file,
    actorFrom(request), contextFrom(request),
  );
  response.status(201).json(successResponse("Medical report uploaded successfully", report));
});

export const listMedicalReports = asyncHandler(async (request, response) => {
  const result = await medicalReportService.list(
    String(request.params.patientId), medicalReportListQuerySchema.parse(request.query),
    actorFrom(request), contextFrom(request),
  );
  response.status(200).json(successResponse("Medical reports retrieved successfully", result.reports, result.meta));
});

export const accessMedicalReport = asyncHandler(async (request, response) => {
  const access = await medicalReportService.access(
    String(request.params.patientId), String(request.params.reportId),
    actorFrom(request), contextFrom(request),
  );
  response.status(200).json(successResponse("Medical report access granted", access));
});

export const deleteMedicalReport = asyncHandler(async (request, response) => {
  const deleted = await medicalReportService.delete(
    String(request.params.patientId), String(request.params.reportId),
    actorFrom(request), contextFrom(request),
  );
  response.status(200).json(successResponse("Medical report deleted successfully", deleted));
});
