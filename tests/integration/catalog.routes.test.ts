import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("doctor and specialty route boundaries", () => {
  it("requires authentication for catalog mutations", async () => {
    const doctor = await request(app).post("/api/v1/doctors").send({}).expect(401);
    const specialty = await request(app).post("/api/v1/specialties").send({}).expect(401);

    expect(doctor.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(specialty.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("validates public catalog queries before database access", async () => {
    const doctors = await request(app).get("/api/v1/doctors?limit=51").expect(400);
    const specialties = await request(app).get("/api/v1/specialties?limit=101").expect(400);

    expect(doctors.body.error.code).toBe("VALIDATION_ERROR");
    expect(specialties.body.error.code).toBe("VALIDATION_ERROR");
  });
});
