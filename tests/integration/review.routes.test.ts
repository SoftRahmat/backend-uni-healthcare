import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../src/app.js";

describe("review route boundaries", () => {
  it("requires authentication for review mutations and patient history", async () => {
    const create = await request(app).post("/api/v1/reviews").send({}).expect(401);
    const patient = await request(app)
      .get("/api/v1/reviews/patient/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
      .expect(401);
    expect(create.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(patient.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
  it("keeps doctor review discovery public with validated input", async () => {
    const result = await request(app).get("/api/v1/reviews/doctor/not-a-uuid").expect(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });
});
