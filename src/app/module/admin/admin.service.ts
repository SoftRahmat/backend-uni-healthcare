import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import type {
  AdminListQuery,
  CreateAdminInput,
  UpdateAdminInput,
} from "./admin.validation.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { hashPassword } from "../../utils/password.js";
import { AdminEmailService } from "./admin-email.service.js";
import {
  cacheInvalidationService,
  type CacheInvalidationService,
} from "./admin-cache.service.js";
import type { RequestContext } from "../../interfaces/index.js";

export type AdminActor = {
  userId: string;
  role: ApplicationRole;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const adminView = (admin: {
  id: string;
  name: string;
  email: string;
  contactNumber: string | null;
  profilePhoto: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user: {
    role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "PATIENT";
    status: "PENDING" | "ACTIVE" | "BLOCKED" | "DELETED";
    needPasswordChange: boolean;
  };
}) => ({
  id: admin.id,
  name: admin.name,
  email: admin.email,
  contactNumber: admin.contactNumber,
  profilePhoto: admin.profilePhoto,
  role: admin.user.role,
  status: admin.user.status,
  needPasswordChange: admin.user.needPasswordChange,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
  deletedAt: admin.deletedAt,
});

export class AdminService {
  constructor(
    private readonly emails = new AdminEmailService(),
    private readonly cache: CacheInvalidationService = cacheInvalidationService,
  ) {}

  async create(input: CreateAdminInput, actor: AdminActor, context: RequestContext) {
    if (actor.role !== "SUPER_ADMIN") {
      throw new ApiError(403, "Only super administrators can create administrators", "FORBIDDEN");
    }

    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");

    const passwordHash = await hashPassword(input.password);
    const admin = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email,
          emailVerified: true,
          role: "ADMIN",
          status: "ACTIVE",
          needPasswordChange: true,
          image: input.profilePhoto,
        },
      });
      const createdAdmin = await transaction.admin.create({
        data: {
          userId: user.id,
          name: input.name,
          email,
          contactNumber: input.contactNumber,
          profilePhoto: input.profilePhoto,
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
          action: "ADMIN_CREATED",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          metadata: { actorUserId: actor.userId },
        },
      });
      return { ...createdAdmin, user };
    });

    await this.emails.sendAdminWelcome(email, input.password);
    await this.cache.invalidateAdmin(admin.id, admin.userId);
    return adminView(admin);
  }

  async update(
    adminId: string,
    input: UpdateAdminInput,
    actor: AdminActor,
    context: RequestContext,
  ) {
    const existing = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { user: true },
    });
    if (!existing || existing.isDeleted || existing.user.deletedAt) {
      throw new ApiError(404, "Administrator was not found", "ADMIN_NOT_FOUND");
    }

    const isSelf = existing.userId === actor.userId;
    if (actor.role !== "SUPER_ADMIN" && !isSelf) {
      throw new ApiError(403, "Administrators can only update their own profile", "FORBIDDEN");
    }
    if (actor.role !== "SUPER_ADMIN" && (input.email || input.role || input.status)) {
      throw new ApiError(403, "Only a super administrator can change email, role, or status", "FORBIDDEN");
    }

    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (email && email !== existing.email) {
      const duplicate = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, id: { not: existing.userId } },
        select: { id: true },
      });
      if (duplicate) throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");
    }

    const updated = await prisma.$transaction(async (transaction) => {
      const admin = await transaction.admin.update({
        where: { id: adminId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
          ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto } : {}),
        },
      });
      const user = await transaction.user.update({
        where: { id: existing.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(input.profilePhoto !== undefined ? { image: input.profilePhoto } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === "ACTIVE" ? { lockedAt: null, failedLoginAttempts: 0 } : {}),
          ...(input.status === "BLOCKED" ? { lockedAt: new Date() } : {}),
        },
      });

      if (input.role && input.role !== existing.user.role) {
        await transaction.auditLog.create({
          data: {
            action: "ADMIN_ROLE_CHANGED",
            userId: existing.userId,
            ...context,
            metadata: { actorUserId: actor.userId, from: existing.user.role, to: input.role },
          },
        });
      }
      if (input.status && input.status !== existing.user.status) {
        await transaction.auditLog.create({
          data: {
            action: "ADMIN_STATUS_CHANGED",
            userId: existing.userId,
            ...context,
            metadata: { actorUserId: actor.userId, from: existing.user.status, to: input.status },
          },
        });
        if (input.status === "BLOCKED") {
          await transaction.session.deleteMany({ where: { userId: existing.userId } });
        }
      }
      await transaction.auditLog.create({
        data: {
          action: "ADMIN_PROFILE_UPDATED",
          userId: existing.userId,
          ...context,
          metadata: { actorUserId: actor.userId, fields: Object.keys(input) },
        },
      });
      return { ...admin, user };
    });

    await this.cache.invalidateAdmin(updated.id, existing.userId);
    return adminView(updated);
  }

  async list(query: AdminListQuery, actor: AdminActor, context: RequestContext) {
    if (actor.role !== "SUPER_ADMIN") {
      throw new ApiError(403, "Only super administrators can list administrators", "FORBIDDEN");
    }

    const where: Prisma.AdminWhereInput = {
      ...(query.includeDeleted ? {} : { isDeleted: false }),
      ...(query.searchTerm ? {
        OR: [
          { name: { contains: query.searchTerm, mode: "insensitive" as const } },
          { email: { contains: query.searchTerm, mode: "insensitive" as const } },
        ],
      } : {}),
      user: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.role ? { role: query.role } : { role: { in: ["ADMIN", "SUPER_ADMIN"] } }),
      },
    };
    const orderBy: Prisma.AdminOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const skip = (query.page - 1) * query.limit;
    const [admins, total] = await prisma.$transaction([
      prisma.admin.findMany({
        where,
        include: { user: true },
        orderBy,
        skip,
        take: query.limit,
      }),
      prisma.admin.count({ where }),
      prisma.auditLog.create({
        data: {
          action: "ADMIN_LIST_VIEWED",
          userId: actor.userId,
          ...context,
          metadata: { page: query.page, limit: query.limit, includeDeleted: query.includeDeleted },
        },
      }),
    ]);

    return {
      admins: admins.map(adminView),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}

export const adminService = new AdminService();
