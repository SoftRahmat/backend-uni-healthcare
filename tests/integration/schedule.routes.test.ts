import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("schedule route boundaries", () => {
  it("validates public schedule queries before database access", async () => {
    const response = await request(app).get("/api/v1/schedules?doctorId=invalid").expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication for schedule mutations", async () => {
    const response = await request(app).post("/api/v1/schedules").send({}).expect(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("protects booked-slot visibility on the public endpoint", async () => {
    const response = await request(app)
      .get("/api/v1/schedules?doctorId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11&showBooked=true")
      .expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});
