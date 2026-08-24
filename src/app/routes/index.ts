import { Router } from "express";

import { adminRouter } from "../module/admin/admin.routes.js";
import { authRouter } from "../module/auth/auth.routes.js";
import { healthRouter } from "../module/health/health.routes.js";
import { specialtyRouter } from "../module/specialty/specialty.routes.js";
import { doctorRouter } from "../module/doctor/doctor.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admins", adminRouter);
apiRouter.use("/specialties", specialtyRouter);
apiRouter.use("/doctors", doctorRouter);
