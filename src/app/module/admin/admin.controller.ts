import type { Request } from "express";

import { adminListQuerySchema, createAdminSchema, updateAdminSchema } from "./admin.validation.js";
import { adminService } from "./admin.service.js";
import type { RequestContext } from "../../interfaces/index.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

const actorFrom = (request: Request) => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { userId: request.auth.userId, role: request.auth.role };
};

export const createAdmin = asyncHandler(async (request, response) => {
  const admin = await adminService.create(
    createAdminSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Admin created successfully", admin));
});

export const updateAdmin = asyncHandler(async (request, response) => {
  const admin = await adminService.update(
    String(request.params.adminId),
    updateAdminSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Admin profile updated successfully", admin));
});

export const updateOwnAdminProfile = asyncHandler(async (request, response) => {
  if (!request.auth?.profileId) {
    throw new ApiError(404, "Administrator profile was not found", "ADMIN_NOT_FOUND");
  }
  const admin = await adminService.update(
    request.auth.profileId,
    updateAdminSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Admin profile updated successfully", admin));
});

export const listAdmins = asyncHandler(async (request, response) => {
  const result = await adminService.list(
    adminListQuerySchema.parse(request.query),
    actorFrom(request),
    contextFrom(request),
  );
  response
    .status(200)
    .json(successResponse("Admins retrieved successfully", result.admins, result.meta));
});
