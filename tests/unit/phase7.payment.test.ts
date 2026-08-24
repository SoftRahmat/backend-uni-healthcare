import { describe, expect, it } from "vitest";

import { DeferredStripePaymentGateway, StripeCheckoutPaymentGateway } from "../../src/app/module/appointment/appointment-payment.service.js";
import { adminPaymentActionSchema, paymentHistoryQuerySchema, refundPaymentSchema } from "../../src/app/module/payment/payment.validation.js";

describe("Phase 7 payment policies", () => {
  it("creates a deterministic 30-minute fallback checkout without trusting client amounts", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const payment = new DeferredStripePaymentGateway().pending({ paymentId: "payment", appointmentId: "appointment", amount: 500, patientId: "patient", now });
    expect(payment.amount).toBe(500);
    expect(payment.status).toBe("PENDING");
    expect(payment.expiresAt.getTime() - now.getTime()).toBe(30 * 60 * 1_000);
  });

  it("uses the non-network fallback when Stripe is not configured", async () => {
    const payment = await new StripeCheckoutPaymentGateway().pending({ paymentId: "payment", appointmentId: "appointment", amount: 500, patientId: "patient", now: new Date() });
    expect(payment.paymentLink).toContain("/payments/payment");
  });

  it("validates bounded history filters and positive refunds", () => {
    expect(paymentHistoryQuerySchema.parse({ page: "2", limit: "50", status: "PAID" })).toMatchObject({ page: 2, limit: 50, status: "PAID" });
    expect(() => paymentHistoryQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => refundPaymentSchema.parse({ amount: 0, reason: "refund requested" })).toThrow();
  });

  it("requires justification for auditable administrator overrides", () => {
    expect(() => adminPaymentActionSchema.parse({ action: "MARK_PAID", transactionId: "manual-1", justification: "short" })).toThrow();
    expect(adminPaymentActionSchema.parse({ action: "ADD_NOTE", notes: "Reviewed", justification: "Reviewed against bank settlement" }).action).toBe("ADD_NOTE");
  });
});
