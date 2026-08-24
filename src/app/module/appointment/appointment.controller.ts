import type { Request } from "express";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { appointmentService, type AppointmentActor } from "./appointment.service.js";
import {
  adminAppointmentQuerySchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  doctorAppointmentQuerySchema,
  patientAppointmentQuerySchema,
  updateAppointmentStatusSchema,
} from "./appointment.validation.js";

const actorFrom = (request: Request): AppointmentActor => {
  if (!request.auth) throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { userId: request.auth.userId, role: request.auth.role, profileId: request.auth.profileId };
};
const contextFrom = (request: Request): RequestContext => ({ ipAddress: request.ip, userAgent: request.header("user-agent") });

export const bookAppointment = asyncHandler(async (request, response) => {
  const result = await appointmentService.book(bookAppointmentSchema.parse(request.body), actorFrom(request), contextFrom(request));
  response.status(201).json(successResponse("Appointment booked successfully", result));
});
export const listPatientAppointments = asyncHandler(async (request, response) => {
  const result = await appointmentService.listPatient(String(request.params.patientId), patientAppointmentQuerySchema.parse(request.query), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Appointments retrieved successfully", result.appointments, result.meta));
});
export const listDoctorAppointments = asyncHandler(async (request, response) => {
  const result = await appointmentService.listDoctor(String(request.params.doctorId), doctorAppointmentQuerySchema.parse(request.query), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Doctor appointments retrieved successfully", { appointments: result.appointments, groupedByDate: result.groupedByDate }, result.meta));
});
export const searchAppointments = asyncHandler(async (request, response) => {
  const result = await appointmentService.search(adminAppointmentQuerySchema.parse(request.query), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Appointments retrieved successfully", { appointments: result.appointments, analytics: result.analytics }, result.meta));
});
export const getAppointment = asyncHandler(async (request, response) => {
  const result = await appointmentService.getById(String(request.params.appointmentId), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Appointment retrieved successfully", result));
});
export const updateAppointmentStatus = asyncHandler(async (request, response) => {
  const result = await appointmentService.updateStatus(String(request.params.appointmentId), updateAppointmentStatusSchema.parse(request.body), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Appointment status updated successfully", result));
});
export const cancelAppointment = asyncHandler(async (request, response) => {
  const result = await appointmentService.cancel(String(request.params.appointmentId), cancelAppointmentSchema.parse(request.body ?? {}), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Appointment cancelled successfully", result));
});
