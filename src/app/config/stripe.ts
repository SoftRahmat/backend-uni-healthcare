import Stripe from "stripe";

import { ApiError } from "../errorHelpers/ApiError.js";
import { env } from "./env.js";

export const stripeClient = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : null;

export const requireStripe = (): Stripe => {
  if (!stripeClient) {
    throw new ApiError(503, "Payment provider is not configured", "PAYMENT_PROVIDER_UNAVAILABLE");
  }
  return stripeClient;
};
