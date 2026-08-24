import { Router } from "express";

import { adminRouter } from "../module/admin/admin.routes.js";
import { authRouter } from "../module/auth/auth.routes.js";
import { healthRouter } from "../module/health/health.routes.js";
import { specialtyRouter } from "../module/specialty/specialty.routes.js";
import { doctorRouter } from "../module/doctor/doctor.routes.js";
import { patientRouter } from "../module/patient/patient.routes.js";
import { scheduleRouter } from "../module/schedule/schedule.routes.js";
import { appointmentRouter } from "../module/appointment/appointment.routes.js";
import { paymentRouter } from "../module/payment/payment.routes.js";
import { prescriptionRouter } from "../module/prescription/prescription.routes.js";
import { reviewRouter } from "../module/review/review.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admins", adminRouter);
apiRouter.use("/specialties", specialtyRouter);
apiRouter.use("/doctors", doctorRouter);
apiRouter.use("/patients", patientRouter);
apiRouter.use("/schedules", scheduleRouter);
apiRouter.use("/appointments", appointmentRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/prescriptions", prescriptionRouter);
apiRouter.use("/reviews", reviewRouter);
