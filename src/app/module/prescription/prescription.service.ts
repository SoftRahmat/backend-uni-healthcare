import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import {
  prescriptionDocumentService,
  verifyPrescriptionToken,
} from "./prescription-document.service.js";
import { prescriptionEmailService } from "./prescription-email.service.js";
import type {
  CreatePrescriptionInput,
  PrescriptionListQuery,
  UpdatePrescriptionInput,
} from "./prescription.validation.js";

export type PrescriptionActor = { userId: string; role: ApplicationRole; profileId?: string };
const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const include = {
  doctor: { include: { specialties: { include: { specialty: true } } } },
  patient: { include: { healthData: true } },
  appointment: { include: { schedule: true } },
  medicines: { orderBy: { sortOrder: "asc" as const } },
  versions: { orderBy: { version: "desc" as const } },
} satisfies Prisma.PrescriptionInclude;
type Record = Prisma.PrescriptionGetPayload<{ include: typeof include }>;
const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};
const validateFollowUp = (value: string | null | undefined, createdAt = new Date()) => {
  if (!value) return value === null ? null : undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date <= new Date())
    throw new ApiError(400, "Follow-up date must be in the future", "INVALID_FOLLOW_UP_DATE");
  if (date > addMonths(createdAt, 6))
    throw new ApiError(400, "Follow-up date must be within six months", "FOLLOW_UP_DATE_TOO_LATE");
  return date;
};
const authorize = (item: Record, actor: PrescriptionActor) => {
  const allowed =
    isAdmin(actor.role) ||
    (actor.role === "PATIENT" && actor.profileId === item.patientId) ||
    (actor.role === "DOCTOR" && actor.profileId === item.doctorId);
  if (!allowed) throw new ApiError(403, "You cannot access this prescription", "FORBIDDEN");
};
const age = (birth?: Date | null) =>
  birth ? Math.floor((Date.now() - birth.getTime()) / (365.25 * 86_400_000)) : null;
const view = (item: Record) => ({
  id: item.id,
  prescriptionNumber: item.prescriptionNumber,
  appointmentId: item.appointmentId,
  instructions: item.instructions,
  medicines: item.medicines,
  followUpDate: item.followUpDate,
  version: item.version,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  doctor: {
    id: item.doctorId,
    name: item.doctor.name,
    licenseNumber: item.doctor.registrationNumber,
    specialties: item.doctor.specialties.map(({ specialty }) => specialty.title),
  },
  patient: {
    id: item.patientId,
    name: item.patient.name,
    age: age(item.patient.healthData?.dateOfBirth),
  },
  appointment: {
    id: item.appointmentId,
    scheduleDate: item.appointment.schedule.scheduleDate.toISOString().slice(0, 10),
    startTime: item.appointment.schedule.startTime,
  },
  versionHistory: item.versions.map(
    ({ objectKey: _objectKey, fileUrl: _fileUrl, ...version }) => version,
  ),
});

export class PrescriptionService {
  async create(input: CreatePrescriptionInput, actor: PrescriptionActor, context: RequestContext) {
    if (actor.role !== "DOCTOR")
      throw new ApiError(403, "Only the assigned doctor can create prescriptions", "FORBIDDEN");
    const appointment = await prisma.appointment.findFirst({
      where: { id: input.appointmentId, isDeleted: false },
      include: { prescription: true, doctor: { include: { user: true } }, patient: true },
    });
    if (!appointment) throw new ApiError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    if (appointment.status !== "COMPLETED")
      throw new ApiError(
        400,
        "Prescription requires a completed appointment",
        "APPOINTMENT_NOT_COMPLETED",
      );
    if (actor.profileId !== appointment.doctorId)
      throw new ApiError(403, "Only the assigned doctor can create this prescription", "FORBIDDEN");
    if (appointment.prescription)
      throw new ApiError(
        409,
        "A prescription already exists for this appointment",
        "PRESCRIPTION_ALREADY_EXISTS",
      );
    if (
      appointment.doctor.user.status !== "ACTIVE" ||
      !appointment.doctor.registrationNumber.trim()
    )
      throw new ApiError(400, "Doctor license is not verified", "DOCTOR_LICENSE_UNVERIFIED");
    const followUpDate = validateFollowUp(input.followUpDate);
    const prescriptionNumber = `RX-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.prescription.create({
        data: {
          prescriptionNumber,
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          instructions: input.instructions,
          followUpDate,
          retentionUntil: new Date(Date.now() + 7 * 365.25 * 86_400_000),
          medicines: {
            create: input.medicines.map((medicine, sortOrder) => ({ ...medicine, sortOrder })),
          },
          versions: {
            create: {
              version: 1,
              instructions: input.instructions,
              followUpDate,
              medicines: input.medicines,
              changedByUserId: actor.userId,
            },
          },
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: "PRESCRIPTION_CREATED",
          userId: actor.userId,
          ...context,
          metadata: {
            prescriptionId: item.id,
            appointmentId: appointment.id,
            doctorId: appointment.doctorId,
            patientId: appointment.patientId,
          },
        },
      });
      return item;
    });
    const document = await prescriptionDocumentService.generate(created.id);
    await prescriptionEmailService.sendIssued({
      patientEmail: appointment.patient.email,
      doctorEmail: appointment.doctor.email,
      followUpDate: created.followUpDate,
      version: 1,
      body: document.body,
    });
    return { ...view(created), pdfUrl: document.downloadUrl };
  }

  async update(
    id: string,
    input: UpdatePrescriptionInput,
    actor: PrescriptionActor,
    context: RequestContext,
    now = new Date(),
  ) {
    const existing = await prisma.prescription.findUnique({ where: { id }, include });
    if (!existing) throw new ApiError(404, "Prescription was not found", "PRESCRIPTION_NOT_FOUND");
    if (actor.role === "PATIENT")
      throw new ApiError(403, "Patients cannot update prescriptions", "FORBIDDEN");
    if (actor.role === "DOCTOR" && actor.profileId !== existing.doctorId)
      throw new ApiError(403, "Only the issuing doctor can update this prescription", "FORBIDDEN");
    if (actor.role === "DOCTOR" && now.getTime() > existing.createdAt.getTime() + 30 * 86_400_000)
      throw new ApiError(
        400,
        "Doctor update window has expired",
        "PRESCRIPTION_UPDATE_WINDOW_EXPIRED",
      );
    if (isAdmin(actor.role) && !input.overrideReason)
      throw new ApiError(
        400,
        "Administrator override reason is required",
        "OVERRIDE_REASON_REQUIRED",
      );
    const followUpDate =
      input.followUpDate !== undefined
        ? validateFollowUp(input.followUpDate, existing.createdAt)
        : existing.followUpDate;
    const instructions = input.instructions ?? existing.instructions;
    const medicines =
      input.medicines ??
      existing.medicines.map(({ name, dosage, frequency, duration, instructions: details }) => ({
        name,
        dosage,
        frequency,
        duration,
        instructions: details ?? undefined,
      }));
    const nextVersion = existing.version + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.prescriptionMedicine.deleteMany({ where: { prescriptionId: id } });
      const item = await tx.prescription.update({
        where: { id },
        data: {
          instructions,
          followUpDate,
          version: nextVersion,
          ...(input.followUpDate !== undefined ? { reminderSentAt: null } : {}),
          medicines: {
            create: medicines.map((medicine, sortOrder) => ({ ...medicine, sortOrder })),
          },
          versions: {
            create: {
              version: nextVersion,
              instructions,
              followUpDate,
              medicines,
              changedByUserId: actor.userId,
              overrideReason: input.overrideReason,
            },
          },
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: "PRESCRIPTION_UPDATED",
          userId: actor.userId,
          ...context,
          metadata: {
            prescriptionId: id,
            version: nextVersion,
            overrideReason: input.overrideReason,
          },
        },
      });
      return item;
    });
    const document = await prescriptionDocumentService.generate(id);
    await prescriptionEmailService.sendIssued({
      patientEmail: updated.patient.email,
      doctorEmail: updated.doctor.email,
      followUpDate: updated.followUpDate,
      version: nextVersion,
      body: document.body,
    });
    return { ...view(updated), pdfUrl: document.downloadUrl };
  }

  async get(id: string, actor: PrescriptionActor, context: RequestContext) {
    const item = await prisma.prescription.findUnique({ where: { id }, include });
    if (!item) throw new ApiError(404, "Prescription was not found", "PRESCRIPTION_NOT_FOUND");
    authorize(item, actor);
    const document = await prescriptionDocumentService.generate(id);
    await prisma.auditLog.create({
      data: {
        action: "PRESCRIPTION_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: { prescriptionId: id },
      },
    });
    return { ...view(item), pdfUrl: document.downloadUrl };
  }

  async pdf(id: string, actor: PrescriptionActor, context: RequestContext) {
    const item = await prisma.prescription.findUnique({ where: { id }, include });
    if (!item) throw new ApiError(404, "Prescription was not found", "PRESCRIPTION_NOT_FOUND");
    authorize(item, actor);
    const document = await prescriptionDocumentService.generate(id);
    await prisma.auditLog.create({
      data: {
        action: "PRESCRIPTION_DOWNLOADED",
        userId: actor.userId,
        ...context,
        metadata: { prescriptionId: id, version: item.version },
      },
    });
    return {
      prescriptionId: id,
      pdfUrl: document.record.fileUrl,
      downloadUrl: document.downloadUrl,
      expiresAt: document.expiresAt,
      fileSize: document.record.sizeBytes,
    };
  }

  async listPatient(patientId: string, query: PrescriptionListQuery, actor: PrescriptionActor) {
    if (actor.role === "PATIENT" && actor.profileId !== patientId)
      throw new ApiError(403, "Patients can only view their prescriptions", "FORBIDDEN");
    if (actor.role === "DOCTOR" && query.doctorId && query.doctorId !== actor.profileId)
      throw new ApiError(403, "Doctors can only view prescriptions they issued", "FORBIDDEN");
    const where: Prisma.PrescriptionWhereInput = {
      patientId,
      ...(actor.role === "DOCTOR"
        ? { doctorId: actor.profileId }
        : query.doctorId
          ? { doctorId: query.doctorId }
          : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              gte: query.startDate ? new Date(`${query.startDate}T00:00:00Z`) : undefined,
              lte: query.endDate ? new Date(`${query.endDate}T23:59:59Z`) : undefined,
            },
          }
        : {}),
      ...(query.specialty
        ? {
            doctor: {
              specialties: {
                some: { specialty: { title: { contains: query.specialty, mode: "insensitive" } } },
              },
            },
          }
        : {}),
      ...(query.search ? { instructions: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const orderBy: Prisma.PrescriptionOrderByWithRelationInput =
      query.sortBy === "doctorName"
        ? { doctor: { name: query.sortOrder } }
        : { [query.sortBy]: query.sortOrder };
    const [items, total] = await prisma.$transaction([
      prisma.prescription.findMany({
        where,
        include,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.prescription.count({ where }),
    ]);
    return {
      prescriptions: items.map(view),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async statistics(doctorId: string, actor: PrescriptionActor, now = new Date()) {
    if (actor.role === "DOCTOR" && actor.profileId !== doctorId)
      throw new ApiError(403, "Doctors can only view their statistics", "FORBIDDEN");
    if (actor.role === "PATIENT")
      throw new ApiError(403, "Statistics access is denied", "FORBIDDEN");
    const yearAgo = addMonths(now, -12);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const items = await prisma.prescription.findMany({
      where: { doctorId, createdAt: { gte: yearAgo } },
      select: { patientId: true, createdAt: true, followUpDate: true },
    });
    const allTime = await prisma.prescription.count({ where: { doctorId } });
    const byMonth = new Map<string, number>();
    const byDay = new Map<string, number>();
    const byHour = new Map<string, number>();
    for (const item of items) {
      const month = item.createdAt.toISOString().slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      const day = item.createdAt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      const hour = String(item.createdAt.getUTCHours()).padStart(2, "0");
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    }
    const followUps = items.filter((item) => item.followUpDate);
    const overdue = followUps.filter((item) => item.followUpDate! < now).length;
    return {
      overview: {
        totalPrescriptions: allTime,
        thisMonthPrescriptions: items.filter((item) => item.createdAt >= monthStart).length,
        averagePerDay: items.length / 365,
        uniquePatients: new Set(items.map((item) => item.patientId)).size,
      },
      trends: {
        byMonth: Object.fromEntries(byMonth),
        byDayOfWeek: Object.fromEntries(byDay),
        peakHours: Object.fromEntries(byHour),
      },
      followUps: {
        upcoming: followUps.length - overdue,
        overdue,
        complianceRate: followUps.length
          ? ((followUps.length - overdue) / followUps.length) * 100
          : 100,
      },
    };
  }

  async dashboard(actor: PrescriptionActor, now = new Date()) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const week = new Date(today.getTime() - 7 * 86_400_000);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [total, todayCount, weekCount, monthCount, previousCount, doctors] =
      await prisma.$transaction([
        prisma.prescription.count(),
        prisma.prescription.count({ where: { createdAt: { gte: today } } }),
        prisma.prescription.count({ where: { createdAt: { gte: week } } }),
        prisma.prescription.count({ where: { createdAt: { gte: month } } }),
        prisma.prescription.count({ where: { createdAt: { gte: previous, lt: month } } }),
        prisma.prescription.groupBy({
          by: ["doctorId"],
          _count: { _all: true },
          _avg: { version: true },
          orderBy: { _count: { doctorId: "desc" } },
          take: 10,
        }),
      ]);
    const doctorRecords = await prisma.doctor.findMany({
      where: { id: { in: doctors.map((item) => item.doctorId) } },
      include: { specialties: { include: { specialty: true } } },
    });
    const performance = await prisma.prescription.findMany({
      where: { doctorId: { in: doctors.map((item) => item.doctorId) } },
      select: { doctorId: true, instructions: true, followUpDate: true },
    });
    return {
      overview: {
        totalPrescriptions: total,
        todayPrescriptions: todayCount,
        weekPrescriptions: weekCount,
        monthPrescriptions: monthCount,
        growthRate: previousCount
          ? ((monthCount - previousCount) / previousCount) * 100
          : monthCount
            ? 100
            : 0,
      },
      topDoctors: doctors.map((row) => {
        const doctor = doctorRecords.find((item) => item.id === row.doctorId);
        const records = performance.filter((item) => item.doctorId === row.doctorId);
        const followUps = records.filter((item) => item.followUpDate);
        const compliant = followUps.filter((item) => item.followUpDate! >= now).length;
        return {
          doctorId: row.doctorId,
          doctorName: doctor?.name,
          prescriptionCount: row._count._all,
          specialty: doctor?.specialties[0]?.specialty.title,
          averagePrescriptionLength: records.length
            ? records.reduce((sum, item) => sum + item.instructions.length, 0) / records.length
            : 0,
          followUpCompliance: followUps.length ? (compliant / followUps.length) * 100 : 100,
          averageVersions: row._avg.version,
        };
      }),
    };
  }

  async verify(id: string, token: string, version: number) {
    const item = await prisma.prescription.findUnique({
      where: { id },
      select: {
        id: true,
        prescriptionNumber: true,
        version: true,
        doctor: { select: { name: true, registrationNumber: true } },
        versions: { where: { version }, select: { version: true, createdAt: true } },
      },
    });
    if (!item || !item.versions.length || !verifyPrescriptionToken(id, version, token))
      throw new ApiError(
        404,
        "Valid prescription verification was not found",
        "PRESCRIPTION_VERIFICATION_FAILED",
      );
    return {
      valid: true,
      id: item.id,
      prescriptionNumber: item.prescriptionNumber,
      verifiedVersion: version,
      currentVersion: item.version,
      issuedAt: item.versions[0]!.createdAt,
      doctor: item.doctor,
    };
  }
}
export const prescriptionService = new PrescriptionService();
