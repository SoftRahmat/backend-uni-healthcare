import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  authorize,
  authorizeExact,
} from "../../src/app/middleware/rbac.middleware.js";
import type { ApplicationRole } from "../../src/app/shared/constants/roles.js";
import { errorHandler } from "../../src/app/middleware/error.middleware.js";
import { requestId } from "../../src/app/middleware/requestId.middleware.js";
import { assertResourceOwnership } from "../../src/app/utils/ownershipPolicy.js";

const authenticatedAs = (role: ApplicationRole): RequestHandler => (req, _res, next) => {
  req.auth = {
    userId: `${role.toLowerCase()}-user`,
    sessionId: "session-id",
    email: `${role.toLowerCase()}@example.com`,
    role,
    profileId: `${role.toLowerCase()}-profile`,
  };
  next();
};

const policyApp = express();
policyApp.use(requestId);
policyApp.get(
  "/hierarchy/admin-as-doctor",
  authenticatedAs("ADMIN"),
  authorize("DOCTOR"),
  (_request, response) => response.status(204).end(),
);
policyApp.get(
  "/hierarchy/patient-as-doctor",
  authenticatedAs("PATIENT"),
  authorize("DOCTOR"),
  (_request, response) => response.status(204).end(),
);
policyApp.get(
  "/exact/admin-only",
  authenticatedAs("SUPER_ADMIN"),
  authorizeExact("ADMIN"),
  (_request, response) => response.status(204).end(),
);
policyApp.get(
  "/exact/multiple",
  authenticatedAs("ADMIN"),
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  (_request, response) => response.status(204).end(),
);
policyApp.use(errorHandler);

describe("role policies", () => {
  it("supports explicit hierarchical inheritance", async () => {
    await request(policyApp).get("/hierarchy/admin-as-doctor").expect(204);
  });

  it("blocks a lower-ranked role from a higher-ranked operation", async () => {
    const response = await request(policyApp).get("/hierarchy/patient-as-doctor").expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("supports exact permission-matrix roles and multiple allowed roles", async () => {
    await request(policyApp).get("/exact/admin-only").expect(403);
    await request(policyApp).get("/exact/multiple").expect(204);
  });
});

describe("service-layer ownership policy", () => {
  const patient = {
    userId: "patient-user",
    profileId: "patient-profile",
    role: "PATIENT" as const,
  };

  it("allows access by user or profile ownership", () => {
    expect(assertResourceOwnership(patient, { ownerUserId: "patient-user" }))
      .toEqual({ usedAdminOverride: false });
    expect(assertResourceOwnership(patient, { ownerProfileId: "patient-profile" }))
      .toEqual({ usedAdminOverride: false });
  });

  it("blocks cross-user access", () => {
    expect(() => assertResourceOwnership(patient, { ownerUserId: "another-user" }))
      .toThrowError("You do not own this resource");
  });

  it("allows auditable admin override and supports disabling it", () => {
    const admin = { userId: "admin-user", profileId: "admin-profile", role: "ADMIN" as const };
    expect(assertResourceOwnership(admin, { ownerUserId: "patient-user" }))
      .toEqual({ usedAdminOverride: true });
    expect(() => assertResourceOwnership(admin, {
      ownerUserId: "patient-user",
      allowAdminOverride: false,
    })).toThrowError("You do not own this resource");
  });
});
