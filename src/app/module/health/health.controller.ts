import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { healthService } from "./health.service.js";

export const getLiveness = asyncHandler(async (_request, response) => {
  response.status(200).json(successResponse("Service is healthy", healthService.liveness()));
});

export const getReadiness = asyncHandler(async (_request, response) => {
  response.status(200).json(successResponse("Service is ready", await healthService.readiness()));
});
