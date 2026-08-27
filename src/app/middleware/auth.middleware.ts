import type { RequestHandler } from "express";

// Shared JWT, database-session, role, and account-status authentication boundary.

import { prisma } from "../lib/prisma.js";
import { ApiError } from "../errorHelpers/ApiError.js";
import { verifyAccessToken } from "../utils/auth-token.js";
import { readAuthCookie } from "../module/auth/auth-cookie.js";

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : readAuthCookie(request);
    if (!token) {
      throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
    }

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw new ApiError(401, "Access token is invalid or expired", "INVALID_ACCESS_TOKEN");
    }

    const session = await prisma.session.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.userId,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { admin: true, doctor: true, patient: true } } },
    });

    if (!session) {
      throw new ApiError(401, "Session is invalid or expired", "INVALID_SESSION");
    }

    if (session.user.status === "PENDING") {
      throw new ApiError(403, "Account verification is pending", "ACCOUNT_PENDING");
    }
    if (session.user.status === "BLOCKED") {
      throw new ApiError(403, "Account is blocked", "ACCOUNT_BLOCKED");
    }
    if (session.user.status === "DELETED" || session.user.deletedAt) {
      throw new ApiError(404, "Account was not found", "ACCOUNT_NOT_FOUND");
    }
    if (session.user.status !== "ACTIVE") {
      throw new ApiError(403, "Account is not active", "ACCOUNT_INACTIVE");
    }
    if (session.user.role !== claims.role) {
      throw new ApiError(401, "Access token role is stale", "STALE_ACCESS_TOKEN");
    }

    request.auth = {
      ...claims,
      profileId: session.user.admin?.id ?? session.user.doctor?.id ?? session.user.patient?.id,
    };
    void prisma.session
      .update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
      })
      .catch(() => undefined);
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuthenticate: RequestHandler = (request, response, next) => {
  if (!request.header("authorization") && !readAuthCookie(request)) {
    next();
    return;
  }
  void authenticate(request, response, next);
};
