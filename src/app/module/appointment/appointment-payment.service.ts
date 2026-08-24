import { env } from "../../config/env.js";

export type PendingPayment = {
  id: string;
  appointmentId: string;
  amount: number;
  currency: string;
  status: "PENDING";
  paymentLink: string;
  expiresAt: Date;
};

export interface AppointmentPaymentGateway {
  pending(input: { paymentId: string; appointmentId: string; amount: number; patientId: string; now: Date }): PendingPayment;
}

export class DeferredStripePaymentGateway implements AppointmentPaymentGateway {
  pending(input: { paymentId: string; appointmentId: string; amount: number; patientId: string; now: Date }): PendingPayment {
    return {
      id: input.paymentId,
      appointmentId: input.appointmentId,
      amount: input.amount,
      currency: "USD",
      status: "PENDING",
      paymentLink: `${env.CLIENT_BASE_URL}/payments/${input.paymentId}`,
      expiresAt: new Date(input.now.getTime() + 30 * 60 * 1_000),
    };
  }
}
