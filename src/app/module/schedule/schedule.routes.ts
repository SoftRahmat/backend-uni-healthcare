import { Router } from "express";

import { authenticate, optionalAuthenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createSchedules,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from "./schedule.controller.js";
import {
  createScheduleSchema,
  scheduleIdParamsSchema,
  scheduleListQuerySchema,
  updateScheduleSchema,
} from "./schedule.validation.js";

export const scheduleRouter = Router();

scheduleRouter.get(
  "/",
  optionalAuthenticate,
  validate({ query: scheduleListQuerySchema }),
  listSchedules,
);
scheduleRouter.post(
  "/",
  authenticate,
  authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR"),
  validate({ body: createScheduleSchema }),
  createSchedules,
);
scheduleRouter.patch(
  "/:scheduleId",
  authenticate,
  authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR"),
  validate({ params: scheduleIdParamsSchema, body: updateScheduleSchema }),
  updateSchedule,
);
scheduleRouter.delete(
  "/:scheduleId",
  authenticate,
  authorizeExact("SUPER_ADMIN", "ADMIN", "DOCTOR"),
  validate({ params: scheduleIdParamsSchema }),
  deleteSchedule,
);
