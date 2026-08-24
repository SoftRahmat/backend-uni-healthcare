import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  bookAppointment,
  cancelAppointment,
  getAppointment,
  listDoctorAppointments,
  listPatientAppointments,
  searchAppointments,
  updateAppointmentStatus,
} from "./appointment.controller.js";
import {
  adminAppointmentQuerySchema,
  appointmentIdParamsSchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  doctorAppointmentParamsSchema,
  doctorAppointmentQuerySchema,
  patientAppointmentParamsSchema,
  patientAppointmentQuerySchema,
  updateAppointmentStatusSchema,
} from "./appointment.validation.js";

export const appointmentRouter = Router();
appointmentRouter.use(authenticate);
appointmentRouter.post("/", authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"), validate({ body: bookAppointmentSchema }), bookAppointment);
appointmentRouter.get("/search", authorizeExact("ADMIN", "SUPER_ADMIN"), validate({ query: adminAppointmentQuerySchema }), searchAppointments);
appointmentRouter.get("/patient/:patientId", authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"), validate({ params: patientAppointmentParamsSchema, query: patientAppointmentQuerySchema }), listPatientAppointments);
appointmentRouter.get("/doctor/:doctorId", authorizeExact("DOCTOR", "ADMIN", "SUPER_ADMIN"), validate({ params: doctorAppointmentParamsSchema, query: doctorAppointmentQuerySchema }), listDoctorAppointments);
appointmentRouter.get("/:appointmentId", validate({ params: appointmentIdParamsSchema }), getAppointment);
appointmentRouter.patch("/:appointmentId/status", validate({ params: appointmentIdParamsSchema, body: updateAppointmentStatusSchema }), updateAppointmentStatus);
appointmentRouter.post("/:appointmentId/cancel", validate({ params: appointmentIdParamsSchema, body: cancelAppointmentSchema }), cancelAppointment);
