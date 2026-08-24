import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { scheduleService, type ScheduleActor } from "./schedule.service.js";
import {
  createScheduleSchema,
  scheduleListQuerySchema,
  updateScheduleSchema,
} from "./schedule.validation.js";

const actorFrom = (request: Request): ScheduleActor => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    profileId: request.auth.profileId,
  };
};
const optionalActorFrom = (request: Request): ScheduleActor | undefined =>
  request.auth ? actorFrom(request) : undefined;
const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const createSchedules = asyncHandler(async (request, response) => {
  const schedules = await scheduleService.create(
    createScheduleSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Schedule created successfully", schedules));
});

export const listSchedules = asyncHandler(async (request, response) => {
  const schedules = await scheduleService.list(
    scheduleListQuerySchema.parse(request.query),
    optionalActorFrom(request),
  );
  response.status(200).json(successResponse("Doctor schedules retrieved successfully", schedules));
});

export const updateSchedule = asyncHandler(async (request, response) => {
  const schedule = await scheduleService.update(
    String(request.params.scheduleId),
    updateScheduleSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Schedule updated successfully", schedule));
});

export const deleteSchedule = asyncHandler(async (request, response) => {
  const schedule = await scheduleService.delete(
    String(request.params.scheduleId),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Schedule deleted successfully", schedule));
});
