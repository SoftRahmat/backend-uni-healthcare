import { Router } from "express";

import { createAdmin, listAdmins, updateAdmin, updateOwnAdminProfile } from "./admin.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  adminIdParamsSchema,
  adminListQuerySchema,
  createAdminSchema,
  updateAdminSchema,
} from "./admin.validation.js";

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.post(
  "/",
  authorizeExact("SUPER_ADMIN"),
  validate({ body: createAdminSchema }),
  createAdmin,
);
adminRouter.get(
  "/",
  authorizeExact("SUPER_ADMIN"),
  validate({ query: adminListQuerySchema }),
  listAdmins,
);
adminRouter.patch(
  "/me",
  authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ body: updateAdminSchema }),
  updateOwnAdminProfile,
);
adminRouter.patch(
  "/:adminId",
  authorizeExact("SUPER_ADMIN", "ADMIN"),
  validate({ params: adminIdParamsSchema, body: updateAdminSchema }),
  updateAdmin,
);
