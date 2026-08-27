import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app.js";
import { authService } from "../../src/app/module/auth/auth.service.js";

describe("authentication route boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("issues a secure browser-session cookie after login", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      accessToken: "signed-access-token",
      expiresIn: 7 * 24 * 60 * 60,
      user: {
        id: "user-1",
        name: "Test Patient",
        email: "patient@example.com",
        role: "PATIENT",
        status: "ACTIVE",
        emailVerified: true,
        needPasswordChange: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        patient: null,
      },
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "patient@example.com", password: "Secure!123" })
      .expect(200);

    expect(response.headers["set-cookie"]?.[0]).toContain("ph_access_token=signed-access-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
  });

  it("rejects weak registration passwords before persistence", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Test Patient",
        email: "patient@example.com",
        password: "weak",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("requires a valid bearer token or session cookie for protected auth operations", async () => {
    const missing = await request(app).get("/api/v1/auth/sessions").expect(401);
    const invalid = await request(app)
      .post("/api/v1/auth/logout")
      .set("authorization", "Bearer invalid")
      .expect(401);

    expect(missing.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(invalid.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects an invalid session cookie", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("cookie", "ph_access_token=invalid")
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects cookie-authenticated mutations without an allowed origin", async () => {
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("cookie", "ph_access_token=invalid")
      .expect(403);

    expect(response.body.error.code).toBe("CSRF_ORIGIN_DENIED");
  });

  it("returns a generic password-reset response for malformed account discovery attempts", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-an-email" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("database");
  });

  it("protects administrator management routes", async () => {
    const response = await request(app).post("/api/v1/admins").send({}).expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
