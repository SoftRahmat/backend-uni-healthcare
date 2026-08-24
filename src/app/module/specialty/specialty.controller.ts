import type { Request } from "express";

import type { RequestContext } from "../../interfaces/index.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { specialtyService } from "./specialty.service.js";
import {
  createSpecialtySchema,
  specialtyListQuerySchema,
  updateSpecialtySchema,
} from "./specialty.validation.js";

const actorFrom = (request: Request) => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { userId: request.auth.userId, role: request.auth.role };
};
const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const createSpecialty = asyncHandler(async (request, response) => {
  const specialty = await specialtyService.create(
    createSpecialtySchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Specialty created successfully", specialty));
});

export const updateSpecialty = asyncHandler(async (request, response) => {
  const specialty = await specialtyService.update(
    String(request.params.specialtyId),
    updateSpecialtySchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Specialty updated successfully", specialty));
});

export const listSpecialties = asyncHandler(async (request, response) => {
  const result = await specialtyService.list(specialtyListQuerySchema.parse(request.query));
  response
    .status(200)
    .json(successResponse("Specialties retrieved successfully", result.specialties, result.meta));
});

export const deleteSpecialty = asyncHandler(async (request, response) => {
  const specialty = await specialtyService.delete(
    String(request.params.specialtyId),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(
    successResponse("Specialty deleted successfully", {
      id: specialty.id,
      title: specialty.title,
      isDeleted: specialty.isDeleted,
    }),
  );
});
