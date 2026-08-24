import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("appointment route boundaries", () => {
  it("requires authentication for booking and appointment reads", async () => {
    const booking = await request(app).post("/api/v1/appointments").send({}).expect(401);
    const detail = await request(app)
      .get("/api/v1/appointments/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
      .expect(401);
    expect(booking.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(detail.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
