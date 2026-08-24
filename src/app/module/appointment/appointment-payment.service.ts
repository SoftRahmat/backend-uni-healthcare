import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { stripeClient } from "../../config/stripe.js";

export type PendingPayment = {
  id: string; appointmentId: string; amount: number; currency: string;
  status: "PENDING"; paymentLink: string; expiresAt: Date;
  stripeCheckoutSessionId?: string; stripePaymentIntentId?: string; clientSecret?: string;
  taxRateBps?: number; taxAmount?: number;
};
export type PendingPaymentInput = {
  paymentId: string; appointmentId: string; amount: number; patientId: string;
  patientEmail?: string; doctorId?: string; attempt?: number; now: Date;
};
export type RefundPaymentInput = {
  paymentId: string; appointmentId: string; stripePaymentIntentId?: string | null;
  amount: number; reason?: string;
};

export interface AppointmentPaymentGateway {
  pending(input: PendingPaymentInput): PendingPayment | Promise<PendingPayment>;
  refund(input: RefundPaymentInput): { providerRefundId: string; status: string } | Promise<{ providerRefundId: string; status: string }>;
}

export class DeferredStripePaymentGateway implements AppointmentPaymentGateway {
  pending(input: PendingPaymentInput): PendingPayment {
    return {
      id: input.paymentId, appointmentId: input.appointmentId, amount: input.amount,
      currency: env.STRIPE_CURRENCY.toUpperCase(), status: "PENDING",
      paymentLink: `${env.CLIENT_BASE_URL}/payments/${input.paymentId}`,
      expiresAt: new Date(input.now.getTime() + 30 * 60 * 1_000),
      taxRateBps: env.INVOICE_TAX_RATE_BPS,
      taxAmount: Math.round(input.amount * env.INVOICE_TAX_RATE_BPS / 10_000),
    };
  }
  refund(_input?: RefundPaymentInput): { providerRefundId: string; status: string } {
    return { providerRefundId: `re_deferred_${randomUUID()}`, status: "succeeded" };
  }
}

export class StripeCheckoutPaymentGateway implements AppointmentPaymentGateway {
  private readonly fallback = new DeferredStripePaymentGateway();

  async pending(input: PendingPaymentInput): Promise<PendingPayment> {
    if (!stripeClient) return this.fallback.pending(input);
    const taxAmount = Math.round(input.amount * env.INVOICE_TAX_RATE_BPS / 10_000);
    const expiresAt = new Date(input.now.getTime() + 30 * 60 * 1_000);
    const metadata = { paymentId: input.paymentId, appointmentId: input.appointmentId, patientId: input.patientId, doctorId: input.doctorId ?? "" };
    const session = await stripeClient.checkout.sessions.create({
      mode: "payment", client_reference_id: input.appointmentId, customer_email: input.patientEmail,
      line_items: [{ quantity: 1, price_data: {
        currency: env.STRIPE_CURRENCY, unit_amount: (input.amount + taxAmount) * 100,
        product_data: { name: "Medical consultation", metadata },
      } }],
      metadata, payment_intent_data: { metadata }, success_url: env.PAYMENT_SUCCESS_URL,
      cancel_url: env.PAYMENT_CANCEL_URL, expires_at: Math.floor(expiresAt.getTime() / 1_000),
    }, { idempotencyKey: `appointment-payment:${input.appointmentId}:${input.attempt ?? 0}` });
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    return {
      id: input.paymentId, appointmentId: input.appointmentId, amount: input.amount,
      currency: env.STRIPE_CURRENCY.toUpperCase(), status: "PENDING",
      paymentLink: session.url ?? `${env.CLIENT_BASE_URL}/payments/${input.paymentId}`,
      expiresAt, stripeCheckoutSessionId: session.id, stripePaymentIntentId: intentId ?? undefined,
      clientSecret: session.client_secret ?? undefined, taxRateBps: env.INVOICE_TAX_RATE_BPS, taxAmount,
    };
  }

  async refund(input: RefundPaymentInput) {
    if (!stripeClient) return this.fallback.refund(input);
    if (!input.stripePaymentIntentId) throw new Error("Stripe payment intent is unavailable for refund");
    const refund = await stripeClient.refunds.create({
      payment_intent: input.stripePaymentIntentId, amount: input.amount * 100,
      reason: "requested_by_customer",
      metadata: { paymentId: input.paymentId, appointmentId: input.appointmentId, reason: input.reason ?? "" },
    }, { idempotencyKey: `appointment-refund:${input.appointmentId}:${input.amount}` });
    return { providerRefundId: refund.id, status: refund.status ?? "pending" };
  }
}
