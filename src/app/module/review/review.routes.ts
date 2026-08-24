import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createReview,
  deleteReview,
  listDoctorReviews,
  listPatientReviews,
  respondToReview,
  reviewStatistics,
  updateReview,
} from "./review.controller.js";
import {
  createReviewSchema,
  deleteReviewSchema,
  doctorResponseSchema,
  doctorReviewParamsSchema,
  doctorReviewQuerySchema,
  patientReviewParamsSchema,
  patientReviewQuerySchema,
  reviewIdParamsSchema,
  updateReviewSchema,
} from "./review.validation.js";
export const reviewRouter = Router();
reviewRouter.get(
  "/doctor/:doctorId",
  validate({ params: doctorReviewParamsSchema, query: doctorReviewQuerySchema }),
  listDoctorReviews,
);
reviewRouter.use(authenticate);
reviewRouter.post(
  "/",
  authorizeExact("PATIENT"),
  validate({ body: createReviewSchema }),
  createReview,
);
reviewRouter.get("/admin/statistics", authorizeExact("ADMIN", "SUPER_ADMIN"), reviewStatistics);
reviewRouter.get(
  "/patient/:patientId",
  authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"),
  validate({ params: patientReviewParamsSchema, query: patientReviewQuerySchema }),
  listPatientReviews,
);
reviewRouter.patch(
  "/:reviewId",
  authorizeExact("PATIENT"),
  validate({ params: reviewIdParamsSchema, body: updateReviewSchema }),
  updateReview,
);
reviewRouter.delete(
  "/:reviewId",
  authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"),
  validate({ params: reviewIdParamsSchema, body: deleteReviewSchema }),
  deleteReview,
);
reviewRouter.post(
  "/:reviewId/response",
  authorizeExact("DOCTOR"),
  validate({ params: reviewIdParamsSchema, body: doctorResponseSchema }),
  respondToReview,
);
