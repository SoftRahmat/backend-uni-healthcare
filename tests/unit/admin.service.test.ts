import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  adminFindUnique: vi.fn(),
  adminFindMany: vi.fn(),
  adminCount: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../src/app/lib/prisma.js", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    admin: {
      findUnique: mocks.adminFindUnique,
      findMany: mocks.adminFindMany,
      count: mocks.adminCount,
    },
    auditLog: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
  },
}));

import { AdminService } from "../../src/app/module/admin/admin.service.js";

const user = {
  id: "user-1",
  name: "Admin User",
  email: "admin@example.com",
  emailVerified: true,
  image: null,
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  needPasswordChange: true,
  lastLoginAt: null,
  failedLoginAttempts: 0,
  failedLoginWindowStartedAt: null,
  lockedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const admin = {
  id: "admin-1",
  userId: user.id,
  name: user.name,
  email: user.email,
  contactNumber: null,
  profilePhoto: null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  isDeleted: false,
  deletedAt: null,
  user,
};

const emails = { sendAdminWelcome: vi.fn() };
const cache = { invalidateAdmin: vi.fn() };
const context = { ipAddress: "127.0.0.1", userAgent: "test" };

describe("AdminService privilege and sanitization rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (argument: unknown) => {
      if (Array.isArray(argument)) return Promise.all(argument);
      return (argument as (transaction: unknown) => unknown)({
        user: { create: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue(user) },
        admin: {
          create: vi.fn().mockResolvedValue({ ...admin, user: undefined }),
          update: vi.fn().mockResolvedValue({ ...admin, user: undefined }),
        },
        account: { create: vi.fn().mockResolvedValue({}) },
        passwordHistory: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });
    });
  });

  it("enforces SUPER_ADMIN inside the service, not only at the route", async () => {
    const service = new AdminService(emails, cache);
    await expect(service.create({
      name: "New Admin",
      email: "new@example.com",
      password: "Strong!Password1",
    }, { userId: "actor", role: "ADMIN" }, context)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
  });

  it("creates and returns a sanitized admin view without credential or relation IDs", async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    const service = new AdminService(emails, cache);
    const result = await service.create({
      name: "New Admin",
      email: "NEW@example.com",
      password: "Strong!Password1",
    }, { userId: "super-user", role: "SUPER_ADMIN" }, context);

    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("password");
    expect(result).toMatchObject({ id: "admin-1", role: "ADMIN", status: "ACTIVE" });
    expect(emails.sendAdminWelcome).toHaveBeenCalledWith("new@example.com", "Strong!Password1");
    expect(cache.invalidateAdmin).toHaveBeenCalledWith("admin-1", "user-1");
  });

  it("blocks cross-admin and privileged self-updates at the service layer", async () => {
    mocks.adminFindUnique.mockResolvedValue(admin);
    const service = new AdminService(emails, cache);

    await expect(service.update(
      admin.id,
      { name: "Changed" },
      { userId: "another-admin", role: "ADMIN" },
      context,
    )).rejects.toMatchObject({ statusCode: 403 });

    await expect(service.update(
      admin.id,
      { role: "SUPER_ADMIN" },
      { userId: user.id, role: "ADMIN" },
      context,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it("paginates and sanitizes the administrator list", async () => {
    mocks.adminFindMany.mockResolvedValue([admin]);
    mocks.adminCount.mockResolvedValue(1);
    const service = new AdminService(emails, cache);
    const result = await service.list({
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      includeDeleted: false,
    }, { userId: "super-user", role: "SUPER_ADMIN" }, context);

    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(result.admins[0]).not.toHaveProperty("userId");
    expect(result.admins[0]).not.toHaveProperty("password");
  });
});
