import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createSpecialty,
  deleteSpecialty,
  listSpecialties,
  updateSpecialty,
} from "./specialty.controller.js";
import {
  createSpecialtySchema,
  specialtyIdParamsSchema,
  specialtyListQuerySchema,
  updateSpecialtySchema,
} from "./specialty.validation.js";

export const specialtyRouter = Router();

specialtyRouter.get("/", validate({ query: specialtyListQuerySchema }), listSpecialties);
specialtyRouter.post(
  "/",
  authenticate,
  authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ body: createSpecialtySchema }),
  createSpecialty,
);
specialtyRouter.patch(
  "/:specialtyId",
  authenticate,
  authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ params: specialtyIdParamsSchema, body: updateSpecialtySchema }),
  updateSpecialty,
);
specialtyRouter.delete(
  "/:specialtyId",
  authenticate,
  authorizeExact("SUPER_ADMIN"),
  validate({ params: specialtyIdParamsSchema }),
  deleteSpecialty,
);
