import type { Prisma } from "../../../generated/prisma/client.js";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import type {
  CreateScheduleInput,
  ScheduleListQuery,
  ScheduleSlot,
  UpdateScheduleInput,
} from "./schedule.validation.js";
import {
  slotDurationMinutes,
  slotsOverlap,
  todayInScheduleTimeZone,
} from "./schedule.validation.js";

export type ScheduleActor = { userId: string; role: ApplicationRole; profileId?: string };
type StoredSchedule = {
  id: string;
  scheduleDate: Date;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const databaseDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const scheduleView = (schedule: StoredSchedule, doctorId: string) => ({
  id: schedule.id,
  doctorId,
  scheduleDate: isoDate(schedule.scheduleDate),
  startTime: schedule.startTime,
  endTime: schedule.endTime,
  isBooked: schedule.isBooked,
  createdAt: schedule.createdAt,
  updatedAt: schedule.updatedAt,
});
const storedSlot = (
  schedule: Pick<StoredSchedule, "scheduleDate" | "startTime" | "endTime">,
): ScheduleSlot => ({
  scheduleDate: isoDate(schedule.scheduleDate),
  startTime: schedule.startTime,
  endTime: schedule.endTime,
});

const assertScheduleRole = (actor: ScheduleActor): void => {
  if (actor.role !== "DOCTOR" && !isAdmin(actor.role)) {
    throw new ApiError(403, "Only doctors and administrators can manage schedules", "FORBIDDEN");
  }
};

const assertTiming = (slot: ScheduleSlot): void => {
  if (slot.scheduleDate < todayInScheduleTimeZone()) {
    throw new ApiError(400, "Schedule date must be today or in the future", "PAST_SCHEDULE_DATE");
  }
  const duration = slotDurationMinutes(slot);
  if (duration <= 0)
    throw new ApiError(400, "End time must be after start time", "INVALID_TIME_RANGE");
  if (duration < 30 || duration > 12 * 60) {
    throw new ApiError(
      400,
      "Schedule duration must be between 30 minutes and 12 hours",
      "INVALID_SCHEDULE_DURATION",
    );
  }
};

const assertManagePermission = (doctorId: string, actor: ScheduleActor): void => {
  assertScheduleRole(actor);
  if (actor.role === "DOCTOR" && actor.profileId !== doctorId) {
    throw new ApiError(403, "Doctors can only manage their own schedules", "FORBIDDEN");
  }
};

const invalidateScheduleCaches = (doctorId: string): void => {
  applicationCache.deleteByPrefix(
    `schedules:doctor:${doctorId}:`,
    `doctor:${doctorId}`,
    "doctors:list:",
    `appointments:doctor:${doctorId}:`,
  );
};

const lockDoctorSchedules = async (transaction: Prisma.TransactionClient, doctorId: string) => {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${doctorId}))`;
};

export class ScheduleService {
  private async requireActiveDoctor(doctorId: string) {
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, isDeleted: false, user: { status: "ACTIVE" } },
      include: {
        user: true,
        specialties: { where: { specialty: { isDeleted: false } }, include: { specialty: true } },
      },
    });
    if (!doctor) throw new ApiError(404, "Active doctor was not found", "DOCTOR_NOT_FOUND");
    return doctor;
  }

  async create(input: CreateScheduleInput, actor: ScheduleActor, context: RequestContext) {
    assertScheduleRole(actor);
    const doctorId = input.doctorId ?? (actor.role === "DOCTOR" ? actor.profileId : undefined);
    if (!doctorId) throw new ApiError(400, "Doctor ID is required", "DOCTOR_ID_REQUIRED");
    assertManagePermission(doctorId, actor);
    for (const slot of input.schedules) assertTiming(slot);
    for (let left = 0; left < input.schedules.length; left += 1) {
      for (let right = left + 1; right < input.schedules.length; right += 1) {
        if (slotsOverlap(input.schedules[left]!, input.schedules[right]!)) {
          throw new ApiError(409, "Bulk schedules cannot overlap", "SCHEDULE_OVERLAP");
        }
      }
    }
    const doctor = await this.requireActiveDoctor(doctorId);
    const created = await prisma.$transaction(async (transaction) => {
      await lockDoctorSchedules(transaction, doctorId);
      const dates = [...new Set(input.schedules.map(({ scheduleDate }) => scheduleDate))].map(
        databaseDate,
      );
      const existing = await transaction.schedule.findMany({
        where: {
          isDeleted: false,
          scheduleDate: { in: dates },
          doctors: { some: { doctorId, isActive: true } },
        },
      });
      const conflict = input.schedules.some((slot) =>
        existing.some((schedule) => slotsOverlap(slot, storedSlot(schedule))),
      );
      if (conflict)
        throw new ApiError(
          409,
          "Schedule overlaps an existing doctor schedule",
          "SCHEDULE_OVERLAP",
        );

      const schedules = [];
      for (const slot of input.schedules) {
        const schedule = await transaction.schedule.create({
          data: {
            scheduleDate: databaseDate(slot.scheduleDate),
            startTime: slot.startTime,
            endTime: slot.endTime,
            doctors: { create: { doctorId } },
          },
        });
        await transaction.auditLog.create({
          data: {
            action: "SCHEDULE_CREATED",
            userId: doctor.userId,
            ...context,
            metadata: { actorUserId: actor.userId, doctorId, scheduleId: schedule.id, ...slot },
          },
        });
        schedules.push(schedule);
      }
      return schedules;
    });
    invalidateScheduleCaches(doctorId);
    const schedules = created.map((schedule) => scheduleView(schedule, doctorId));
    return schedules.length === 1 ? schedules[0] : schedules;
  }

  async list(query: ScheduleListQuery, actor?: ScheduleActor) {
    if (query.showBooked) {
      if (!actor || actor.role === "PATIENT") {
        throw new ApiError(
          403,
          "Booked schedules are only visible to doctors and administrators",
          "FORBIDDEN",
        );
      }
      if (actor.role === "DOCTOR" && actor.profileId !== query.doctorId) {
        throw new ApiError(403, "Doctors can only view their own booked schedules", "FORBIDDEN");
      }
    }
    const visibility = query.showBooked ? "ALL" : "AVAILABLE";
    const cacheKey = `schedules:doctor:${query.doctorId}:${visibility}:${query.startDate}:${query.endDate}`;
    const cached = applicationCache.get<unknown>(cacheKey);
    if (cached) return cached;

    const doctor = await this.requireActiveDoctor(query.doctorId);
    const today = todayInScheduleTimeZone();
    const effectiveStartDate = query.startDate < today ? today : query.startDate;
    const schedules =
      effectiveStartDate > query.endDate
        ? []
        : await prisma.schedule.findMany({
            where: {
              isDeleted: false,
              scheduleDate: {
                gte: databaseDate(effectiveStartDate),
                lte: databaseDate(query.endDate),
              },
              ...(!query.showBooked ? { isBooked: false } : {}),
              doctors: { some: { doctorId: query.doctorId, isActive: true } },
            },
            orderBy: [{ scheduleDate: "asc" }, { startTime: "asc" }],
          });
    const result = {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialties[0]?.specialty.title ?? null,
        specialties: doctor.specialties.map(({ specialty }) => ({
          id: specialty.id,
          title: specialty.title,
        })),
        appointmentFee: doctor.appointmentFee,
      },
      schedules: schedules.map((schedule) => scheduleView(schedule, query.doctorId)),
    };
    applicationCache.set(cacheKey, result, 5 * 60);
    return result;
  }

  async update(
    scheduleId: string,
    input: UpdateScheduleInput,
    actor: ScheduleActor,
    context: RequestContext,
  ) {
    assertScheduleRole(actor);
    const existing = await prisma.schedule.findFirst({
      where: { id: scheduleId, isDeleted: false },
      include: { doctors: { where: { isActive: true }, include: { doctor: true } } },
    });
    const assignment = existing?.doctors[0];
    if (!existing || !assignment)
      throw new ApiError(404, "Schedule was not found", "SCHEDULE_NOT_FOUND");
    assertManagePermission(assignment.doctorId, actor);
    if (existing.isBooked)
      throw new ApiError(409, "Booked schedules cannot be updated", "SCHEDULE_ALREADY_BOOKED");
    const slot: ScheduleSlot = {
      scheduleDate: input.scheduleDate ?? isoDate(existing.scheduleDate),
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
    };
    assertTiming(slot);

    const updated = await prisma.$transaction(async (transaction) => {
      await lockDoctorSchedules(transaction, assignment.doctorId);
      const current = await transaction.schedule.findUnique({ where: { id: scheduleId } });
      if (!current || current.isDeleted)
        throw new ApiError(404, "Schedule was not found", "SCHEDULE_NOT_FOUND");
      if (current.isBooked)
        throw new ApiError(409, "Booked schedules cannot be updated", "SCHEDULE_ALREADY_BOOKED");
      const overlaps = await transaction.schedule.findMany({
        where: {
          id: { not: scheduleId },
          isDeleted: false,
          scheduleDate: databaseDate(slot.scheduleDate),
          doctors: { some: { doctorId: assignment.doctorId, isActive: true } },
        },
      });
      if (overlaps.some((schedule) => slotsOverlap(slot, storedSlot(schedule)))) {
        throw new ApiError(
          409,
          "Schedule overlaps an existing doctor schedule",
          "SCHEDULE_OVERLAP",
        );
      }
      const schedule = await transaction.schedule.update({
        where: { id: scheduleId },
        data: {
          scheduleDate: databaseDate(slot.scheduleDate),
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "SCHEDULE_UPDATED",
          userId: assignment.doctor.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            doctorId: assignment.doctorId,
            scheduleId,
            fields: Object.keys(input),
          },
        },
      });
      return schedule;
    });
    invalidateScheduleCaches(assignment.doctorId);
    return scheduleView(updated, assignment.doctorId);
  }

  async delete(scheduleId: string, actor: ScheduleActor, context: RequestContext) {
    assertScheduleRole(actor);
    const existing = await prisma.schedule.findFirst({
      where: { id: scheduleId, isDeleted: false },
      include: { doctors: { where: { isActive: true }, include: { doctor: true } } },
    });
    const assignment = existing?.doctors[0];
    if (!existing || !assignment)
      throw new ApiError(404, "Schedule was not found", "SCHEDULE_NOT_FOUND");
    assertManagePermission(assignment.doctorId, actor);
    if (existing.isBooked) {
      throw new ApiError(
        409,
        "Cancel the appointment before deleting this schedule",
        "SCHEDULE_ALREADY_BOOKED",
      );
    }
    if (isoDate(existing.scheduleDate) < todayInScheduleTimeZone()) {
      throw new ApiError(
        409,
        "Past schedules are archived and cannot be deleted",
        "PAST_SCHEDULE_ARCHIVED",
      );
    }

    const deletedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      await lockDoctorSchedules(transaction, assignment.doctorId);
      const current = await transaction.schedule.findUnique({ where: { id: scheduleId } });
      if (!current || current.isDeleted)
        throw new ApiError(404, "Schedule was not found", "SCHEDULE_NOT_FOUND");
      if (current.isBooked) {
        throw new ApiError(
          409,
          "Cancel the appointment before deleting this schedule",
          "SCHEDULE_ALREADY_BOOKED",
        );
      }
      await transaction.schedule.update({
        where: { id: scheduleId },
        data: { isDeleted: true, deletedAt },
      });
      await transaction.doctorSchedule.updateMany({
        where: { scheduleId },
        data: { isActive: false },
      });
      await transaction.auditLog.create({
        data: {
          action: "SCHEDULE_DELETED",
          userId: assignment.doctor.userId,
          ...context,
          metadata: { actorUserId: actor.userId, doctorId: assignment.doctorId, scheduleId },
        },
      });
    });
    invalidateScheduleCaches(assignment.doctorId);
    return { id: scheduleId, isDeleted: true, deletedAt };
  }
}

export const scheduleService = new ScheduleService();
