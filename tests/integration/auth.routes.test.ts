import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("authentication route boundary", () => {
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

  it("requires a valid bearer token for protected auth operations", async () => {
    const missing = await request(app).get("/api/v1/auth/sessions").expect(401);
    const invalid = await request(app)
      .post("/api/v1/auth/logout")
      .set("authorization", "Bearer invalid")
      .expect(401);

    expect(missing.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(invalid.body.error.code).toBe("INVALID_ACCESS_TOKEN");
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
