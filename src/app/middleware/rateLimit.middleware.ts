import { rateLimit } from "express-rate-limit";
import type { Request, Response } from "express";

import { env } from "../config/env.js";
import { errorResponse } from "../utils/ApiResponse.js";

const handler = (message: string, code: string) => (request: Request, response: Response) =>
  response.status(429).json(errorResponse(message, code, 429, request.requestId));

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (request) => request.path === "/payments/webhooks/stripe",
  handler: handler("Too many requests", "RATE_LIMIT_EXCEEDED"),
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: handler("Too many authentication requests", "AUTH_RATE_LIMIT_EXCEEDED"),
});
