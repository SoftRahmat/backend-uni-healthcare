import { describe, expect, it } from "vitest";
import { applyAppointmentDiscount } from "../../src/app/module/appointment/appointment.service.js";
import {
  moderateDoctorResponse,
  moderateReviewComment,
} from "../../src/app/module/review/review-moderation.service.js";
import {
  createReviewSchema,
  doctorReviewQuerySchema,
  updateReviewSchema,
} from "../../src/app/module/review/review.validation.js";

describe("Phase 9 review policies", () => {
  it("validates ratings, comments, and bounded public queries", () => {
    expect(() =>
      createReviewSchema.parse({
        appointmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        rating: 6,
      }),
    ).toThrow();
    expect(
      createReviewSchema.parse({ appointmentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", rating: 5 })
        .displayAnonymous,
    ).toBe(true);
    expect(() => updateReviewSchema.parse({})).toThrow();
    expect(() => doctorReviewQuerySchema.parse({ limit: 51 })).toThrow();
  });
  it("rejects executable markup without silently changing patient content", () => {
    expect(() => moderateReviewComment("<script>alert(1)</script>")).toThrowError(/HTML/);
    expect(moderateReviewComment("Helpful and professional care.").comment).toBe(
      "Helpful and professional care.",
    );
  });
  it("flags abusive or spam-like content for moderation", () => {
    expect(moderateReviewComment("This is a scam").flagged).toBe(true);
    expect(moderateReviewComment("https://a.test https://b.test https://c.test").flagged).toBe(
      true,
    );
    expect(() => moderateDoctorResponse("This is stupid")).toThrowError(/professional/);
  });
  it("applies the earned five-percent discount exactly once at booking", () => {
    expect(applyAppointmentDiscount(500, 500)).toBe(475);
    expect(applyAppointmentDiscount(500, 0)).toBe(500);
    expect(applyAppointmentDiscount(500, 20_000)).toBe(0);
  });
});
