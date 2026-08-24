import type { Prisma } from "../../../generated/prisma/client.js";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { assertResourceOwnership } from "../../utils/ownershipPolicy.js";
import type {
  PatientHealthDataInput,
  PatientListQuery,
  UpdatePatientInput,
} from "./patient.validation.js";

export type PatientActor = { userId: string; role: ApplicationRole; profileId?: string };
const isAdmin = (role: ApplicationRole) => role === "ADMIN" || role === "SUPER_ADMIN";
const invalidate = (patientId: string) =>
  applicationCache.deleteByPrefix(
    "patients:list:",
    `patient:${patientId}:`,
    `appointments:patient:${patientId}:`,
  );

type PatientListResult = {
  patients: Array<
    ReturnType<typeof publicPatientView> & {
      statistics: {
        totalAppointments: number;
        completedAppointments: number;
        totalReviews: number;
        lastAppointment: Date | null;
      };
    }
  >;
  stats: { total: number; active: number; blocked: number };
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const publicPatientView = (patient: {
  id: string;
  name: string;
  email: string;
  contactNumber: string | null;
  address: string | null;
  profilePhoto: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { status: string };
}) => ({
  id: patient.id,
  name: patient.name,
  email: patient.email,
  contactNumber: patient.contactNumber,
  address: patient.address,
  profilePhoto: patient.profilePhoto,
  status: patient.user.status,
  isDeleted: patient.isDeleted,
  deletedAt: patient.deletedAt,
  createdAt: patient.createdAt,
  updatedAt: patient.updatedAt,
});

const riskIndicators = (
  healthData: {
    bmi: number | null;
    smokingStatus: boolean | null;
    alcoholConsumption: boolean | null;
    allergies: string | null;
    chronicConditions: string | null;
  } | null,
) => {
  if (!healthData) return [];
  const risks: string[] = [];
  if (healthData.bmi !== null && (healthData.bmi < 18.5 || healthData.bmi >= 25))
    risks.push("BMI_OUTSIDE_HEALTHY_RANGE");
  if (healthData.smokingStatus) risks.push("SMOKING");
  if (healthData.alcoholConsumption) risks.push("ALCOHOL_CONSUMPTION");
  if (healthData.allergies) risks.push("RECORDED_ALLERGIES");
  if (healthData.chronicConditions) risks.push("CHRONIC_CONDITION");
  return risks;
};

export class PatientService {
  async update(
    patientId: string,
    input: UpdatePatientInput,
    actor: PatientActor,
    context: RequestContext,
  ) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, isDeleted: false },
      include: { user: true },
    });
    if (!patient) throw new ApiError(404, "Patient was not found", "PATIENT_NOT_FOUND");
    const ownership = assertResourceOwnership(actor, { ownerUserId: patient.userId });
    if (!isAdmin(actor.role) && input.status !== undefined) {
      throw new ApiError(403, "Only administrators can change patient status", "FORBIDDEN");
    }

    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.patient.update({
        where: { id: patientId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto } : {}),
        },
      });
      await transaction.user.update({
        where: { id: patient.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.profilePhoto !== undefined ? { image: input.profilePhoto } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === "BLOCKED" ? { lockedAt: new Date() } : {}),
          ...(input.status === "ACTIVE" ? { lockedAt: null, failedLoginAttempts: 0 } : {}),
        },
      });
      if (input.status === "BLOCKED") {
        await transaction.session.deleteMany({ where: { userId: patient.userId } });
      }
      await transaction.auditLog.create({
        data: {
          action: "PATIENT_PROFILE_UPDATED",
          userId: patient.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            patientId,
            fields: Object.keys(input),
            adminOverride: ownership.usedAdminOverride,
          },
        },
      });
      return transaction.patient.findUniqueOrThrow({
        where: { id: patientId },
        include: { user: true },
      });
    });
    invalidate(patientId);
    return publicPatientView(updated);
  }

  async list(query: PatientListQuery, actor: PatientActor, context: RequestContext) {
    if (!isAdmin(actor.role))
      throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const key = `patients:list:${JSON.stringify(query)}`;
    const cached = applicationCache.get<PatientListResult>(key);
    if (cached) return cached;
    const where: Prisma.PatientWhereInput = {
      ...(!query.includeDeleted ? { isDeleted: false } : {}),
      ...(query.status ? { user: { status: query.status } } : {}),
      ...(query.searchTerm
        ? {
            OR: [
              { name: { contains: query.searchTerm, mode: "insensitive" } },
              { email: { contains: query.searchTerm, mode: "insensitive" } },
              { contactNumber: { contains: query.searchTerm, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? { createdAt: { gte: query.createdFrom, lte: query.createdTo } }
        : {}),
    };
    const [patients, total, active, blocked, completedGroups] = await prisma.$transaction([
      prisma.patient.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          user: true,
          _count: { select: { appointments: { where: { isDeleted: false } } } },
          appointments: {
            where: { isDeleted: false },
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { schedule: { select: { scheduleDate: true } } },
          },
        },
      }),
      prisma.patient.count({ where }),
      prisma.patient.count({ where: { isDeleted: false, user: { status: "ACTIVE" } } }),
      prisma.patient.count({ where: { isDeleted: false, user: { status: "BLOCKED" } } }),
      prisma.appointment.groupBy({
        by: ["patientId"],
        where: { status: "COMPLETED", isDeleted: false },
        _count: { _all: true },
      }),
    ]);
    const completedByPatient = new Map(
      completedGroups.map((group) => [group.patientId, group._count._all]),
    );
    await prisma.auditLog.create({
      data: {
        action: "PATIENT_LIST_VIEWED",
        userId: actor.userId,
        ...context,
        metadata: {
          filters: {
            ...query,
            createdFrom: query.createdFrom?.toISOString(),
            createdTo: query.createdTo?.toISOString(),
          },
          resultCount: patients.length,
        },
      },
    });
    const result = {
      patients: patients.map((patient) => ({
        ...publicPatientView(patient),
        statistics: {
          totalAppointments: patient._count.appointments,
          completedAppointments: completedByPatient.get(patient.id) ?? 0,
          totalReviews: 0,
          lastAppointment: patient.appointments[0]?.schedule.scheduleDate ?? null,
        },
      })),
      stats: { total, active, blocked },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
    applicationCache.set(key, result, 5 * 60);
    return result;
  }

  async getById(patientId: string, actor: PatientActor, context: RequestContext) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, isDeleted: false },
      include: {
        user: true,
        healthData: true,
        medicalReports: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            reportName: true,
            reportType: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
    });
    if (!patient) throw new ApiError(404, "Patient was not found", "PATIENT_NOT_FOUND");
    let ownership = { usedAdminOverride: false };
    if (actor.role === "DOCTOR") {
      const assigned = actor.profileId
        ? await prisma.appointment.findFirst({
            where: {
              patientId,
              doctorId: actor.profileId,
              isDeleted: false,
              status: { not: "CANCELLED" },
            },
            select: { id: true },
          })
        : null;
      if (!assigned)
        throw new ApiError(
          403,
          "A doctor requires an assigned appointment to access this patient",
          "PATIENT_ASSIGNMENT_REQUIRED",
        );
    } else {
      ownership = assertResourceOwnership(actor, { ownerUserId: patient.userId });
    }
    const [appointmentCount, completedAppointments, lastAppointment] = await prisma.$transaction([
      prisma.appointment.count({ where: { patientId, isDeleted: false } }),
      prisma.appointment.count({ where: { patientId, isDeleted: false, status: "COMPLETED" } }),
      prisma.appointment.findFirst({
        where: { patientId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        select: { schedule: { select: { scheduleDate: true } } },
      }),
    ]);
    await prisma.auditLog.create({
      data: {
        action: "PATIENT_DETAIL_VIEWED",
        userId: patient.userId,
        ...context,
        metadata: {
          actorUserId: actor.userId,
          patientId,
          adminOverride: ownership.usedAdminOverride,
        },
      },
    });
    return {
      ...publicPatientView(patient),
      healthData: patient.healthData,
      recentMedicalReports: patient.medicalReports,
      stats: {
        appointmentCount,
        completedAppointments,
        reviewCount: 0,
        lastAppointment: lastAppointment?.schedule.scheduleDate ?? null,
      },
      riskIndicators: riskIndicators(patient.healthData),
    };
  }

  async saveHealthData(
    patientId: string,
    input: PatientHealthDataInput,
    actor: PatientActor,
    context: RequestContext,
  ) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, isDeleted: false },
      include: { healthData: { select: { id: true } } },
    });
    if (!patient) throw new ApiError(404, "Patient was not found", "PATIENT_NOT_FOUND");
    assertResourceOwnership(actor, { ownerUserId: patient.userId, allowAdminOverride: false });
    if (actor.role !== "PATIENT")
      throw new ApiError(403, "Only patients can update their health data", "FORBIDDEN");
    const bmi =
      input.heightCm && input.weightKg
        ? Number((input.weightKg / (input.heightCm / 100) ** 2).toFixed(2))
        : undefined;
    const healthData = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.patientHealthData.upsert({
        where: { patientId },
        create: { patientId, ...input, bmi: bmi ?? null },
        update: { ...input, ...(bmi !== undefined ? { bmi } : {}) },
      });
      await transaction.auditLog.create({
        data: {
          action: "PATIENT_HEALTH_DATA_SAVED",
          userId: patient.userId,
          ...context,
          metadata: { patientId, fields: Object.keys(input) },
        },
      });
      return saved;
    });
    invalidate(patientId);
    return {
      healthData: { ...healthData, riskIndicators: riskIndicators(healthData) },
      created: patient.healthData === null,
    };
  }
}

export const patientService = new PatientService();
