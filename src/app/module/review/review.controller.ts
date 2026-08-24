import type { Request } from "express";
import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { reviewService, type ReviewActor } from "./review.service.js";
import {
  createReviewSchema,
  deleteReviewSchema,
  doctorResponseSchema,
  doctorReviewQuerySchema,
  patientReviewQuerySchema,
  updateReviewSchema,
} from "./review.validation.js";
const actorFrom = (request: Request): ReviewActor => {
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
export const createReview = asyncHandler(async (request, response) => {
  const result = await reviewService.create(
    createReviewSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Review submitted successfully", result));
});
export const updateReview = asyncHandler(async (request, response) => {
  const result = await reviewService.update(
    String(request.params.reviewId),
    updateReviewSchema.parse(request.body),
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Review updated successfully", result));
});
export const deleteReview = asyncHandler(async (request, response) => {
  const { reason } = deleteReviewSchema.parse(request.body ?? {});
  const result = await reviewService.delete(
    String(request.params.reviewId),
    reason,
    actorFrom(request),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Review deleted successfully", result));
});
export const listDoctorReviews = asyncHandler(async (request, response) => {
  const result = await reviewService.listDoctor(
    String(request.params.doctorId),
    doctorReviewQuerySchema.parse(request.query),
  );
  response.status(200).json(
    successResponse(
      "Doctor reviews retrieved successfully",
      {
        doctor: result.doctor,
        ratingDistribution: result.ratingDistribution,
        ratingPercentages: result.ratingPercentages,
        reviews: result.reviews,
      },
      result.meta,
    ),
  );
});
export const listPatientReviews = asyncHandler(async (request, response) => {
  const result = await reviewService.listPatient(
    String(request.params.patientId),
    patientReviewQuerySchema.parse(request.query),
    actorFrom(request),
    contextFrom(request),
  );
  response
    .status(200)
    .json(successResponse("Patient reviews retrieved successfully", result.reviews, result.meta));
});
export const respondToReview = asyncHandler(async (request, response) => {
  const { response: text } = doctorResponseSchema.parse(request.body);
  const result = await reviewService.respond(
    String(request.params.reviewId),
    text,
    actorFrom(request),
    contextFrom(request),
  );
  response.status(201).json(successResponse("Response added successfully", result));
});
export const reviewStatistics = asyncHandler(async (request, response) => {
  const result = await reviewService.statistics(actorFrom(request));
  response.status(200).json(successResponse("Review statistics retrieved successfully", result));
});
