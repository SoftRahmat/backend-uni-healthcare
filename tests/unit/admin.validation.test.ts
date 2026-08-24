import { describe, expect, it } from "vitest";

import {
  adminListQuerySchema,
  createAdminSchema,
  updateAdminSchema,
} from "../../src/app/module/admin/admin.validation.js";

describe("admin input contracts", () => {
  it("accepts a valid administrator and rejects invalid contact/photo/password data", () => {
    expect(createAdminSchema.safeParse({
      name: "System Admin",
      email: "admin@example.com",
      password: "Strong!Password1",
      contactNumber: "+12345678901",
      profilePhoto: "https://example.com/admin.jpg",
    }).success).toBe(true);

    expect(createAdminSchema.safeParse({
      name: "A",
      email: "bad",
      password: "weak",
      contactNumber: "not-a-phone",
      profilePhoto: "not-a-url",
    }).success).toBe(false);
  });

  it("rejects unknown self-update fields and empty updates", () => {
    expect(updateAdminSchema.safeParse({}).success).toBe(false);
    expect(updateAdminSchema.safeParse({ password: "unexpected" }).success).toBe(false);
  });

  it("applies pagination defaults, limits, filters, sorting, and include-deleted parsing", () => {
    expect(adminListQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      includeDeleted: false,
    });
    expect(adminListQuerySchema.parse({
      page: "2",
      limit: "100",
      status: "BLOCKED",
      role: "ADMIN",
      sortBy: "name",
      sortOrder: "asc",
      includeDeleted: "true",
    })).toMatchObject({ page: 2, limit: 100, includeDeleted: true });
    expect(adminListQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
