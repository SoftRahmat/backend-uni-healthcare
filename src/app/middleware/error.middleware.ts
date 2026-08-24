import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../errorHelpers/ApiError.js";
import { errorResponse } from "../utils/ApiResponse.js";

type BodyParserError = SyntaxError & { body?: unknown; status?: number };
type HttpError = Error & { status?: number };

const isInvalidJsonError = (error: unknown): error is BodyParserError =>
  error instanceof SyntaxError &&
  "status" in error &&
  (error as BodyParserError).status === 400 &&
  "body" in error;

const isPayloadTooLargeError = (error: unknown): error is HttpError =>
  error instanceof Error &&
  "status" in error &&
  (error as HttpError).status === 413;

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    apiError = new ApiError(400, "Request validation failed", "VALIDATION_ERROR", error.flatten());
  } else if (error instanceof multer.MulterError) {
    apiError = error.code === "LIMIT_FILE_SIZE"
      ? new ApiError(413, "Medical report must not exceed 10 MB", "FILE_TOO_LARGE")
      : new ApiError(400, "Medical report upload failed", "UPLOAD_ERROR", { code: error.code });
  } else if (isInvalidJsonError(error)) {
    apiError = new ApiError(400, "Request body contains invalid JSON", "INVALID_JSON");
  } else if (isPayloadTooLargeError(error)) {
    apiError = new ApiError(413, "Request body is too large", "PAYLOAD_TOO_LARGE");
  } else {
    apiError = new ApiError(500, "Internal server error", "INTERNAL_SERVER_ERROR", undefined, false);
  }

  const logMetadata = {
    requestId: request.requestId,
    method: request.method,
    path: request.path,
    statusCode: apiError.statusCode,
    code: apiError.code,
    ...(apiError.isOperational ? {} : { error }),
  };

  if (apiError.statusCode >= 500) {
    logger.error(apiError.message, logMetadata);
  } else {
    logger.warn(apiError.message, logMetadata);
  }

  const details = env.NODE_ENV === "production" && apiError.statusCode >= 500
    ? undefined
    : apiError.details;

  response
    .status(apiError.statusCode)
    .json(errorResponse(apiError.message, apiError.code, apiError.statusCode, request.requestId, details));
};
