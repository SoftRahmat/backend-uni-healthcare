import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { patientService, type PatientActor } from "./patient.service.js";
import {
  patientHealthDataSchema,
  patientListQuerySchema,
  updatePatientSchema,
} from "./patient.validation.js";

export const patientActorFrom = (request: Request): PatientActor => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    profileId: request.auth.profileId,
  };
};
export const patientContextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const updatePatient = asyncHandler(async (request, response) => {
  const patient = await patientService.update(
    String(request.params.patientId),
    updatePatientSchema.parse(request.body),
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response.status(200).json(successResponse("Patient profile updated successfully", patient));
});

export const updateOwnPatient = asyncHandler(async (request, response) => {
  if (!request.auth?.profileId)
    throw new ApiError(404, "Patient profile was not found", "PATIENT_NOT_FOUND");
  const patient = await patientService.update(
    request.auth.profileId,
    updatePatientSchema.parse(request.body),
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response.status(200).json(successResponse("Patient profile updated successfully", patient));
});

export const listPatients = asyncHandler(async (request, response) => {
  const result = await patientService.list(
    patientListQuerySchema.parse(request.query),
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response
    .status(200)
    .json(
      successResponse(
        "Patients retrieved successfully",
        { patients: result.patients, stats: result.stats },
        result.meta,
      ),
    );
});

export const getPatient = asyncHandler(async (request, response) => {
  const patient = await patientService.getById(
    String(request.params.patientId),
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response.status(200).json(successResponse("Patient retrieved successfully", patient));
});

export const getOwnPatient = asyncHandler(async (request, response) => {
  if (!request.auth?.profileId)
    throw new ApiError(404, "Patient profile was not found", "PATIENT_NOT_FOUND");
  const patient = await patientService.getById(
    request.auth.profileId,
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response.status(200).json(successResponse("Patient retrieved successfully", patient));
});

export const savePatientHealthData = asyncHandler(async (request, response) => {
  const result = await patientService.saveHealthData(
    String(request.params.patientId),
    patientHealthDataSchema.parse(request.body),
    patientActorFrom(request),
    patientContextFrom(request),
  );
  response
    .status(result.created ? 201 : 200)
    .json(successResponse("Patient health data saved successfully", result.healthData));
});
