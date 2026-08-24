import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../../src/app.js";

describe("patient and medical report route boundaries", () => {
  it("requires authentication for patient medical data", async () => {
    const list = await request(app).get("/api/v1/patients").expect(401);
    const health = await request(app)
      .put("/api/v1/patients/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/health-data")
      .send({})
      .expect(401);
    expect(list.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(health.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("does not process unauthenticated multipart uploads", async () => {
    const response = await request(app)
      .post("/api/v1/patients/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/medical-reports")
      .attach("file", Buffer.from("%PDF-1.7\ncontent"), { filename: "report.pdf", contentType: "application/pdf" })
      .field("reportName", "Blood test")
      .field("reportType", "LAB_TEST")
      .expect(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});
