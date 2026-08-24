import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("application shell", () => {
  it("returns service metadata without mutating the database", async () => {
    const response = await request(app).get("/").expect(200);

    expect(response.body).toMatchObject({
      success: true,
      message: "Welcome to the PH-HealthCare API",
      data: {
        service: "ph-healthcare-api",
        apiBaseUrl: "/api/v1",
      },
    });
  });

  it("exposes versioned health information and security headers", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: { status: "ok", service: "ph-healthcare-api" },
    });
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("uses the standard error response for unknown routes", async () => {
    const response = await request(app).get("/api/v1/missing").expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "ROUTE_NOT_FOUND" },
      statusCode: 404,
      requestId: expect.any(String),
    });
  });

  it("rejects malformed JSON with a sanitized error", async () => {
    const response = await request(app)
      .post("/api/v1/health")
      .set("content-type", "application/json")
      .send('{"invalid"')
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "INVALID_JSON" },
      statusCode: 400,
    });
  });

  it("rejects request bodies that exceed the configured limit", async () => {
    const response = await request(app)
      .post("/api/v1/health")
      .send({ content: "x".repeat(1_100_000) })
      .expect(413);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
      statusCode: 413,
    });
  });

  it("rejects browser origins outside the allowlist", async () => {
    const response = await request(app)
      .get("/api/v1/health")
      .set("origin", "https://untrusted.example")
      .expect(403);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: "CORS_ORIGIN_DENIED" },
      statusCode: 403,
    });
  });
});
