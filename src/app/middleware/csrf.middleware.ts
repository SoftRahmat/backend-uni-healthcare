import type { RequestHandler } from "express";

import { env } from "../config/env.js";
import { ApiError } from "../errorHelpers/ApiError.js";
import { readAuthCookie } from "../module/auth/auth-cookie.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigins = new Set(env.CORS_ORIGINS);

export const protectCookieAuthentication: RequestHandler = (request, _response, next) => {
  if (
    safeMethods.has(request.method) ||
    request.header("authorization")?.startsWith("Bearer ") ||
    !readAuthCookie(request)
  ) {
    next();
    return;
  }

  const origin = request.header("origin");
  if (origin && (allowedOrigins.has("*") || allowedOrigins.has(origin))) {
    next();
    return;
  }

  next(new ApiError(403, "Request origin could not be verified", "CSRF_ORIGIN_DENIED"));
};
