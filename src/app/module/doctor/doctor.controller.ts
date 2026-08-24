import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { doctorService } from "./doctor.service.js";
import {
  createDoctorSchema,
  deleteDoctorSchema,
  doctorListQuerySchema,
  updateDoctorSchema,
} from "./doctor.validation.js";

const actorFrom = (request: Request) => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    profileId: request.auth.profileId,
  };
};
const optionalActorFrom = (request: Request) => (request.auth ? actorFrom(request) : undefined);
const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const createDoctor = asyncHandler(async (request, response) => {
  const doctor = await doctorService.create(
    createDoctorSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Doctor created successfully", doctor));
});

export const updateDoctor = asyncHandler(async (request, response) => {
  const doctor = await doctorService.update(
    String(request.params.doctorId),
    updateDoctorSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Doctor profile updated successfully", doctor));
});

export const updateOwnDoctorProfile = asyncHandler(async (request, response) => {
  if (!request.auth?.profileId)
    throw new ApiError(404, "Doctor profile was not found", "DOCTOR_NOT_FOUND");
  const doctor = await doctorService.update(
    request.auth.profileId,
    updateDoctorSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Doctor profile updated successfully", doctor));
});

export const listDoctors = asyncHandler(async (request, response) => {
  const result = await doctorService.list(
    doctorListQuerySchema.parse(request.query),
    optionalActorFrom(request),
  );
  response
    .status(200)
    .json(successResponse("Doctors retrieved successfully", result.doctors, result.meta));
});

export const getDoctor = asyncHandler(async (request, response) => {
  const doctor = await doctorService.getById(
    String(request.params.doctorId),
    optionalActorFrom(request),
  );
  response.status(200).json(successResponse("Doctor retrieved successfully", doctor));
});

export const deleteDoctor = asyncHandler(async (request, response) => {
  const result = await doctorService.delete(
    String(request.params.doctorId),
    deleteDoctorSchema.parse(request.body ?? {}),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Doctor account deactivated successfully", result));
});
