import { prisma } from "../../lib/prisma.js";
import { applicationCache } from "../../lib/cache.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import type { RequestContext } from "../../interfaces/index.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import type {
  CreateSpecialtyInput,
  SpecialtyListQuery,
  UpdateSpecialtyInput,
} from "./specialty.validation.js";

type SpecialtyActor = { userId: string; role: ApplicationRole };

const requireAdmin = (actor: SpecialtyActor): void => {
  if (!["SUPER_ADMIN", "ADMIN"].includes(actor.role)) {
    throw new ApiError(403, "Administrator access is required", "FORBIDDEN");
  }
};

const invalidateSpecialtyCaches = (): void => {
  applicationCache.deleteByPrefix("specialties:list:", "doctors:list:", "doctor:");
};

export class SpecialtyService {
  async create(input: CreateSpecialtyInput, actor: SpecialtyActor, context: RequestContext) {
    requireAdmin(actor);
    const duplicate = await prisma.specialty.findFirst({
      where: { title: { equals: input.title, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, "Specialty title already exists", "SPECIALTY_ALREADY_EXISTS");

    const specialty = await prisma.$transaction(async (transaction) => {
      const created = await transaction.specialty.create({ data: input });
      await transaction.auditLog.create({
        data: {
          action: "SPECIALTY_CREATED",
          userId: actor.userId,
          ...context,
          metadata: { specialtyId: created.id },
        },
      });
      return created;
    });
    invalidateSpecialtyCaches();
    return specialty;
  }

  async update(
    specialtyId: string,
    input: UpdateSpecialtyInput,
    actor: SpecialtyActor,
    context: RequestContext,
  ) {
    requireAdmin(actor);
    const existing = await prisma.specialty.findFirst({
      where: { id: specialtyId, isDeleted: false },
    });
    if (!existing) throw new ApiError(404, "Specialty was not found", "SPECIALTY_NOT_FOUND");
    if (input.title) {
      const duplicate = await prisma.specialty.findFirst({
        where: {
          id: { not: specialtyId },
          title: { equals: input.title, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (duplicate) throw new ApiError(409, "Specialty title already exists", "SPECIALTY_ALREADY_EXISTS");
    }

    const specialty = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.specialty.update({ where: { id: specialtyId }, data: input });
      await transaction.auditLog.create({
        data: {
          action: "SPECIALTY_UPDATED",
          userId: actor.userId,
          ...context,
          metadata: { specialtyId, fields: Object.keys(input) },
        },
      });
      return updated;
    });
    invalidateSpecialtyCaches();
    return specialty;
  }

  async list(query: SpecialtyListQuery) {
    const cacheKey = `specialties:list:${JSON.stringify(query)}`;
    const cached = applicationCache.get<Awaited<ReturnType<SpecialtyService["listUncached"]>>>(cacheKey);
    if (cached) return cached;
    const result = await this.listUncached(query);
    applicationCache.set(cacheKey, result, 60 * 60);
    return result;
  }

  private async listUncached(query: SpecialtyListQuery) {
    const where = {
      isDeleted: false,
      ...(query.searchTerm ? {
        title: { contains: query.searchTerm, mode: "insensitive" as const },
      } : {}),
    };
    const [specialties, total] = await prisma.$transaction([
      prisma.specialty.findMany({
        where,
        orderBy: { title: "asc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: {
            select: {
              doctors: {
                where: { doctor: { isDeleted: false, user: { status: "ACTIVE" } } },
              },
            },
          },
        },
      }),
      prisma.specialty.count({ where }),
    ]);
    return {
      specialties: specialties.map(({ _count, ...specialty }) => ({
        ...specialty,
        doctorCount: _count.doctors,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async delete(specialtyId: string, actor: SpecialtyActor, context: RequestContext) {
    if (actor.role !== "SUPER_ADMIN") {
      throw new ApiError(403, "Only a super administrator can delete specialties", "FORBIDDEN");
    }
    const specialty = await prisma.specialty.findFirst({
      where: { id: specialtyId, isDeleted: false },
      include: {
        _count: { select: { doctors: { where: { doctor: { isDeleted: false } } } } },
      },
    });
    if (!specialty) throw new ApiError(404, "Specialty was not found", "SPECIALTY_NOT_FOUND");
    if (specialty._count.doctors > 0) {
      throw new ApiError(409, "Reassign active doctors before deleting this specialty", "SPECIALTY_IN_USE");
    }
    const activeCount = await prisma.specialty.count({ where: { isDeleted: false } });
    if (activeCount <= 5) {
      throw new ApiError(409, "At least five active specialties must remain", "MINIMUM_SPECIALTIES_REQUIRED");
    }

    const deleted = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.specialty.update({
        where: { id: specialtyId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          action: "SPECIALTY_DELETED",
          userId: actor.userId,
          ...context,
          metadata: { specialtyId },
        },
      });
      return updated;
    });
    invalidateSpecialtyCaches();
    return deleted;
  }
}

export const specialtyService = new SpecialtyService();
