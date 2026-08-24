import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("payment route boundaries", () => {
  it("keeps payment details and administration behind authentication", async () => {
    const detail = await request(app)
      .get("/api/v1/payments/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")
      .expect(401);
    const dashboard = await request(app).get("/api/v1/payments/admin/dashboard").expect(401);
    expect(detail.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(dashboard.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects unsigned Stripe webhook calls", async () => {
    const result = await request(app)
      .post("/api/v1/payments/webhooks/stripe")
      .send({ id: "evt_test" })
      .expect(400);
    expect(result.body.error.code).toBe("INVALID_WEBHOOK_REQUEST");
  });
});
