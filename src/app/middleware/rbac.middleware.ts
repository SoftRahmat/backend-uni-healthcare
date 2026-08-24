import type { RequestHandler } from "express";

// Shared hierarchical and exact permission-matrix authorization policies.

import { ROLE_RANK, type ApplicationRole } from "../shared/constants/roles.js";
import { ApiError } from "../errorHelpers/ApiError.js";

const requireRole = (role: string | undefined): ApplicationRole => {
  if (!role || !(role in ROLE_RANK)) {
    throw new ApiError(403, "User role is invalid", "INVALID_USER_ROLE");
  }
  return role as ApplicationRole;
};

/** Hierarchical access: a higher-ranked role inherits the requested lower rank. */
export const authorize = (...allowedRoles: ApplicationRole[]): RequestHandler =>
  (request, _response, next) => {
    try {
      const role = requireRole(request.auth?.role);
      const allowed = allowedRoles.some((allowedRole) => ROLE_RANK[role] >= ROLE_RANK[allowedRole]);
      if (!allowed) throw new ApiError(403, "You do not have permission to perform this action", "FORBIDDEN");
      next();
    } catch (error) {
      next(error);
    }
  };

/** Exact matrix access for operations that must not be inherited, such as clinical writes. */
export const authorizeExact = (...allowedRoles: ApplicationRole[]): RequestHandler =>
  (request, _response, next) => {
    try {
      const role = requireRole(request.auth?.role);
      if (!allowedRoles.includes(role)) {
        throw new ApiError(403, "You do not have permission to perform this action", "FORBIDDEN");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
