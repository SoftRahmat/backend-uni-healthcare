import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { prescriptionService, type PrescriptionActor } from "./prescription.service.js";
import {
  createPrescriptionSchema,
  prescriptionListQuerySchema,
  updatePrescriptionSchema,
  verifyPrescriptionQuerySchema,
} from "./prescription.validation.js";

const actorFrom = (request: Request): PrescriptionActor => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    profileId: request.auth.profileId,
  };
};
const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});
export const createPrescription = asyncHandler(async (request, response) => {
  const result = await prescriptionService.create(
    createPrescriptionSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Prescription created successfully", result));
});
export const updatePrescription = asyncHandler(async (request, response) => {
  const result = await prescriptionService.update(
    String(request.params.prescriptionId),
    updatePrescriptionSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Prescription updated successfully", result));
});
export const getPrescription = asyncHandler(async (request, response) => {
  const result = await prescriptionService.get(
    String(request.params.prescriptionId),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Prescription retrieved successfully", result));
});
export const downloadPrescription = asyncHandler(async (request, response) => {
  const result = await prescriptionService.pdf(
    String(request.params.prescriptionId),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Prescription PDF generated successfully", result));
});
export const listPatientPrescriptions = asyncHandler(async (request, response) => {
  const result = await prescriptionService.listPatient(
    String(request.params.patientId),
    prescriptionListQuerySchema.parse(request.query),
    actorFrom(request),
  );
  response
    .status(200)
    .json(
      successResponse("Prescriptions retrieved successfully", result.prescriptions, result.meta),
    );
});
export const doctorPrescriptionStatistics = asyncHandler(async (request, response) => {
  const result = await prescriptionService.statistics(
    String(request.params.doctorId),
    actorFrom(request),
  );
  response
    .status(200)
    .json(successResponse("Prescription statistics retrieved successfully", result));
});
export const adminPrescriptionDashboard = asyncHandler(async (request, response) => {
  const result = await prescriptionService.dashboard(actorFrom(request));
  response
    .status(200)
    .json(successResponse("Admin prescription dashboard retrieved successfully", result));
});
export const verifyPrescription = asyncHandler(async (request, response) => {
  const { token, version } = verifyPrescriptionQuerySchema.parse(request.query);
  const result = await prescriptionService.verify(
    String(request.params.prescriptionId),
    token,
    version,
  );
  response.status(200).json(successResponse("Prescription verified successfully", result));
});
