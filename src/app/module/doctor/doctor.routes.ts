import { Router } from "express";

import { authenticate, optionalAuthenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createDoctor,
  deleteDoctor,
  getDoctor,
  listDoctors,
  updateDoctor,
  updateOwnDoctorProfile,
} from "./doctor.controller.js";
import {
  createDoctorSchema,
  deleteDoctorSchema,
  doctorIdParamsSchema,
  doctorListQuerySchema,
  updateDoctorSchema,
} from "./doctor.validation.js";

export const doctorRouter = Router();

doctorRouter.get("/", optionalAuthenticate, validate({ query: doctorListQuerySchema }), listDoctors);
doctorRouter.get("/:doctorId", optionalAuthenticate, validate({ params: doctorIdParamsSchema }), getDoctor);
doctorRouter.post(
  "/", authenticate, authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ body: createDoctorSchema }), createDoctor,
);
doctorRouter.patch(
  "/me", authenticate, authorizeExact("DOCTOR"),
  validate({ body: updateDoctorSchema }), updateOwnDoctorProfile,
);
doctorRouter.patch(
  "/:doctorId", authenticate, authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR"),
  validate({ params: doctorIdParamsSchema, body: updateDoctorSchema }), updateDoctor,
);
doctorRouter.delete(
  "/:doctorId", authenticate, authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ params: doctorIdParamsSchema, body: deleteDoctorSchema }), deleteDoctor,
);
