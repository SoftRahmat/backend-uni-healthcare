import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("prescription route boundaries", () => {
  it("requires authentication for prescription medical records", async () => {
    const create = await request(app).post("/api/v1/prescriptions").send({}).expect(401);
    const detail = await request(app)
      .get("/api/v1/prescriptions/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
      .expect(401);
    expect(create.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(detail.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("keeps verification public but validates its signed token", async () => {
    const result = await request(app)
      .get("/api/v1/prescriptions/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/verify?token=short")
      .expect(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });
});
