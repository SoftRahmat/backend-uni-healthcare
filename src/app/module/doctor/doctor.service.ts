import type { Prisma } from "../../../generated/prisma/client.js";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { applicationCache } from "../../lib/cache.js";
import { prisma } from "../../lib/prisma.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { hashPassword } from "../../utils/password.js";
import { DoctorEmailService } from "./doctor-email.service.js";
import { addIsoDays, todayInScheduleTimeZone } from "../schedule/schedule.validation.js";
import type {
  CreateDoctorInput,
  DeleteDoctorInput,
  DoctorListQuery,
  UpdateDoctorInput,
} from "./doctor.validation.js";

type DoctorActor = { userId: string; role: ApplicationRole; profileId?: string };
type DoctorWithRelations = Prisma.DoctorGetPayload<{
  include: { user: true; specialties: { include: { specialty: true } } };
}>;

const isAdmin = (role: ApplicationRole): boolean => ["SUPER_ADMIN", "ADMIN"].includes(role);
const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const invalidateDoctorCaches = (doctorId?: string): void => {
  applicationCache.deleteByPrefix(
    "doctors:list:",
    "specialties:list:",
    ...(doctorId ? [
      `doctor:${doctorId}`,
      `schedules:doctor:${doctorId}:`,
      `appointments:doctor:${doctorId}:`,
    ] : []),
  );
};

const doctorView = (doctor: DoctorWithRelations) => ({
  id: doctor.id,
  name: doctor.name,
  email: doctor.email,
  contactNumber: doctor.contactNumber,
  address: doctor.address,
  registrationNumber: doctor.registrationNumber,
  experience: doctor.experience,
  gender: doctor.gender,
  appointmentFee: doctor.appointmentFee,
  qualification: doctor.qualification,
  currentWorkingPlace: doctor.currentWorkingPlace,
  designation: doctor.designation,
  bio: doctor.bio,
  profilePhoto: doctor.profilePhoto,
  averageRating: doctor.averageRating,
  totalReviews: doctor.totalReviews,
  status: doctor.user.status,
  specialties: doctor.specialties.map(({ specialty }) => ({
    id: specialty.id,
    title: specialty.title,
    icon: specialty.icon,
    description: specialty.description,
  })),
  createdAt: doctor.createdAt,
  updatedAt: doctor.updatedAt,
  deletedAt: doctor.deletedAt,
});

export class DoctorService {
  constructor(private readonly emails = new DoctorEmailService()) {}

  private async validateSpecialties(ids: string[] | undefined): Promise<string[]> {
    if (!ids?.length) return [];
    const specialties = await prisma.specialty.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true },
    });
    if (specialties.length !== ids.length) {
      throw new ApiError(400, "One or more specialty IDs are invalid", "INVALID_SPECIALTY_IDS");
    }
    return ids;
  }

  async create(input: CreateDoctorInput, actor: DoctorActor, context: RequestContext) {
    if (!isAdmin(actor.role)) throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    const email = normalizeEmail(input.email);
    const [emailOwner, registrationOwner, specialtyIds, passwordHash] = await Promise.all([
      prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }),
      prisma.doctor.findFirst({
        where: { registrationNumber: { equals: input.registrationNumber, mode: "insensitive" } },
        select: { id: true },
      }),
      this.validateSpecialties(input.specialtyIds),
      hashPassword(input.password),
    ]);
    if (emailOwner) throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");
    if (registrationOwner) {
      throw new ApiError(409, "Registration number already exists", "REGISTRATION_NUMBER_EXISTS");
    }

    const doctor = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email,
          emailVerified: true,
          image: input.profilePhoto,
          role: "DOCTOR",
          status: "ACTIVE",
          needPasswordChange: true,
        },
      });
      const created = await transaction.doctor.create({
        data: {
          userId: user.id,
          name: input.name,
          email,
          contactNumber: input.contactNumber,
          address: input.address,
          registrationNumber: input.registrationNumber,
          experience: input.experience,
          gender: input.gender,
          appointmentFee: input.appointmentFee,
          qualification: input.qualification,
          currentWorkingPlace: input.currentWorkingPlace,
          designation: input.designation,
          bio: input.bio,
          profilePhoto: input.profilePhoto,
          specialties: specialtyIds.length ? {
            create: specialtyIds.map((specialtyId) => ({ specialtyId })),
          } : undefined,
        },
      });
      await transaction.account.create({
        data: {
          userId: user.id,
          issuer: "local:credential",
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      await transaction.passwordHistory.create({ data: { userId: user.id, passwordHash } });
      await transaction.auditLog.create({
        data: {
          action: "DOCTOR_CREATED",
          userId: user.id,
          ...context,
          metadata: { actorUserId: actor.userId, doctorId: created.id },
        },
      });
      return transaction.doctor.findUniqueOrThrow({
        where: { id: created.id },
        include: { user: true, specialties: { include: { specialty: true } } },
      });
    });
    invalidateDoctorCaches();
    await this.emails.sendWelcome(email, input.password);
    return doctorView(doctor);
  }

  async update(
    doctorId: string,
    input: UpdateDoctorInput,
    actor: DoctorActor,
    context: RequestContext,
  ) {
    const existing = await prisma.doctor.findFirst({
      where: { id: doctorId, isDeleted: false },
      include: { user: true },
    });
    if (!existing) throw new ApiError(404, "Doctor was not found", "DOCTOR_NOT_FOUND");
    const ownsProfile = existing.userId === actor.userId;
    if (!isAdmin(actor.role) && !(actor.role === "DOCTOR" && ownsProfile)) {
      throw new ApiError(403, "Doctors can only update their own profile", "FORBIDDEN");
    }
    if (!isAdmin(actor.role) && (input.email !== undefined || input.status !== undefined)) {
      throw new ApiError(403, "Only administrators can change doctor email or status", "FORBIDDEN");
    }
    if ("averageRating" in input || "totalReviews" in input || "registrationNumber" in input) {
      throw new ApiError(400, "Registration and rating fields are read-only", "READ_ONLY_FIELD");
    }

    const specialtyIds = input.specialtyIds === undefined
      ? undefined
      : await this.validateSpecialties(input.specialtyIds);
    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (email && email !== existing.email) {
      const owner = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, id: { not: existing.userId } },
        select: { id: true },
      });
      if (owner) throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");
    }

    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.doctor.update({
        where: { id: doctorId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.experience !== undefined ? { experience: input.experience } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.appointmentFee !== undefined ? { appointmentFee: input.appointmentFee } : {}),
          ...(input.qualification !== undefined ? { qualification: input.qualification } : {}),
          ...(input.currentWorkingPlace !== undefined ? { currentWorkingPlace: input.currentWorkingPlace } : {}),
          ...(input.designation !== undefined ? { designation: input.designation } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto } : {}),
        },
      });
      await transaction.user.update({
        where: { id: existing.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.profilePhoto !== undefined ? { image: input.profilePhoto } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === "BLOCKED" ? { lockedAt: new Date() } : {}),
          ...(input.status === "ACTIVE" ? { lockedAt: null, failedLoginAttempts: 0 } : {}),
        },
      });
      if (specialtyIds !== undefined) {
        await transaction.doctorSpecialty.deleteMany({ where: { doctorId } });
        if (specialtyIds.length) {
          await transaction.doctorSpecialty.createMany({
            data: specialtyIds.map((specialtyId) => ({ doctorId, specialtyId })),
          });
        }
      }
      if (input.status === "BLOCKED") {
        await transaction.session.deleteMany({ where: { userId: existing.userId } });
      }
      await transaction.auditLog.create({
        data: {
          action: "DOCTOR_PROFILE_UPDATED",
          userId: existing.userId,
          ...context,
          metadata: { actorUserId: actor.userId, doctorId, fields: Object.keys(input) },
        },
      });
      return transaction.doctor.findUniqueOrThrow({
        where: { id: doctorId },
        include: { user: true, specialties: { include: { specialty: true } } },
      });
    });
    invalidateDoctorCaches(doctorId);
    return doctorView(updated);
  }

  async list(query: DoctorListQuery, actor?: DoctorActor) {
    const canSeeBlocked = Boolean(actor && isAdmin(actor.role));
    const cacheKey = `doctors:list:${canSeeBlocked}:${JSON.stringify(query)}`;
    const cached = applicationCache.get<{ doctors: ReturnType<typeof doctorView>[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(cacheKey);
    if (cached) return cached;

    const where: Prisma.DoctorWhereInput = {
      isDeleted: false,
      ...(!canSeeBlocked ? { user: { status: "ACTIVE" } } : { user: { status: { in: ["ACTIVE", "BLOCKED"] } } }),
      ...(query.searchTerm ? {
        OR: [
          { name: { contains: query.searchTerm, mode: "insensitive" } },
          { qualification: { contains: query.searchTerm, mode: "insensitive" } },
        ],
      } : {}),
      ...(query.specialtyIds?.length ? {
        specialties: { some: { specialtyId: { in: query.specialtyIds } } },
      } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.minExperience !== undefined || query.maxExperience !== undefined ? {
        experience: { gte: query.minExperience, lte: query.maxExperience },
      } : {}),
      ...(query.minFee !== undefined || query.maxFee !== undefined ? {
        appointmentFee: { gte: query.minFee, lte: query.maxFee },
      } : {}),
    };
    const [doctors, total] = await prisma.$transaction([
      prisma.doctor.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { user: true, specialties: { include: { specialty: true } } },
      }),
      prisma.doctor.count({ where }),
    ]);
    const result = {
      doctors: doctors.map(doctorView),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
    applicationCache.set(cacheKey, result, 5 * 60);
    return result;
  }

  async getById(doctorId: string, actor?: DoctorActor) {
    const cacheKey = `doctor:${doctorId}:${actor?.role ?? "PUBLIC"}`;
    const cached = applicationCache.get<ReturnType<typeof doctorView> & {
      recentReviews: unknown[];
      availability: {
        hasAvailableSlots: boolean;
        nextAvailableDate: string | null;
        availableSlotsThisWeek: number;
      };
    }>(cacheKey);
    if (cached) return cached;
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, isDeleted: false },
      include: { user: true, specialties: { include: { specialty: true } } },
    });
    if (!doctor) throw new ApiError(404, "Doctor was not found", "DOCTOR_NOT_FOUND");
    if (doctor.user.status === "BLOCKED" && !(actor && isAdmin(actor.role))) {
      throw new ApiError(403, "Doctor is not currently available", "DOCTOR_BLOCKED");
    }
    const today = todayInScheduleTimeZone();
    const endDate = addIsoDays(today, 7);
    const availabilityWhere: Prisma.ScheduleWhereInput = {
      isDeleted: false,
      isBooked: false,
      scheduleDate: {
        gte: new Date(`${today}T00:00:00.000Z`),
        lte: new Date(`${endDate}T00:00:00.000Z`),
      },
      doctors: { some: { doctorId, isActive: true } },
    };
    const [nextAvailable, availableSlotsThisWeek] = await prisma.$transaction([
      prisma.schedule.findFirst({
        where: availabilityWhere,
        orderBy: [{ scheduleDate: "asc" }, { startTime: "asc" }],
        select: { scheduleDate: true },
      }),
      prisma.schedule.count({ where: availabilityWhere }),
    ]);
    const result = {
      ...doctorView(doctor),
      recentReviews: [],
      availability: {
        hasAvailableSlots: availableSlotsThisWeek > 0,
        nextAvailableDate: nextAvailable?.scheduleDate.toISOString().slice(0, 10) ?? null,
        availableSlotsThisWeek,
      },
    };
    applicationCache.set(cacheKey, result, 10 * 60);
    return result;
  }

  async delete(
    doctorId: string,
    input: DeleteDoctorInput,
    actor: DoctorActor,
    context: RequestContext,
  ) {
    if (!isAdmin(actor.role)) throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
    if (input.force && actor.role !== "SUPER_ADMIN") {
      throw new ApiError(403, "Only a super administrator can force deletion", "FORBIDDEN");
    }
    const existing = await prisma.doctor.findFirst({
      where: { id: doctorId, isDeleted: false },
      include: { user: true },
    });
    if (!existing) throw new ApiError(404, "Doctor was not found", "DOCTOR_NOT_FOUND");

    const deleted = await prisma.$transaction(async (transaction) => {
      const doctor = await transaction.doctor.update({
        where: { id: doctorId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await transaction.user.update({
        where: { id: existing.userId },
        data: { status: "BLOCKED", lockedAt: new Date() },
      });
      await transaction.session.deleteMany({ where: { userId: existing.userId } });
      await transaction.doctorSchedule.updateMany({
        where: { doctorId },
        data: { isActive: false },
      });
      await transaction.auditLog.create({
        data: {
          action: "DOCTOR_DELETED",
          userId: existing.userId,
          ...context,
          metadata: { actorUserId: actor.userId, doctorId, reason: input.reason, force: input.force },
        },
      });
      return doctor;
    });
    invalidateDoctorCaches(doctorId);
    await this.emails.sendDeactivation(existing.email, input.reason);
    return {
      id: deleted.id,
      name: deleted.name,
      deletedAt: deleted.deletedAt,
      upcomingAppointments: 0,
      affectedPatients: 0,
    };
  }
}

export const doctorService = new DoctorService();
