import type { Request } from "express";

import {
  changePasswordSchema,
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "./auth.validation.js";
import { authService } from "./auth.service.js";
import type { RequestContext } from "../../interfaces/index.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

const requireAuth = (request: Request) => {
  if (!request.auth)
    throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return request.auth;
};

export const register = asyncHandler(async (request, response) => {
  const user = await authService.register(registerSchema.parse(request.body), contextFrom(request));
  response
    .status(201)
    .json(
      successResponse("Registration successful. Check your email to verify your account.", user),
    );
});

export const verifyEmail = asyncHandler(async (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  const user = await authService.verifyEmail(token, contextFrom(request));
  response.status(200).json(successResponse("Email verified successfully", user));
});

export const resendVerification = asyncHandler(async (request, response) => {
  const { email } = emailSchema.parse(request.body);
  await authService.resendVerification(email, contextFrom(request));
  response
    .status(200)
    .json(successResponse("If the account is awaiting verification, an email will be sent.", null));
});

export const login = asyncHandler(async (request, response) => {
  const result = await authService.login(loginSchema.parse(request.body), contextFrom(request));
  response.status(200).json(successResponse("Login successful", result));
});

export const forgotPassword = asyncHandler(async (request, response) => {
  const { email } = emailSchema.parse(request.body);
  await authService.requestPasswordReset(email, contextFrom(request));
  response
    .status(200)
    .json(
      successResponse("If an eligible account exists, a password reset email will be sent.", null),
    );
});

export const resetPassword = asyncHandler(async (request, response) => {
  const input = resetPasswordSchema.parse(request.body);
  await authService.resetPassword(input.token, input.password, contextFrom(request));
  response
    .status(200)
    .json(successResponse("Password reset successfully. Sign in again on all devices.", null));
});

export const changePassword = asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  await authService.changePassword(
    auth.userId,
    auth.sessionId,
    changePasswordSchema.parse(request.body),
    contextFrom(request),
  );
  response.status(200).json(successResponse("Password changed successfully", null));
});

export const logout = asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  await authService.logout(auth.userId, auth.sessionId, contextFrom(request));
  response.status(200).json(successResponse("Logged out successfully", null));
});

export const logoutAll = asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  await authService.logoutAll(auth.userId, contextFrom(request));
  response.status(200).json(successResponse("Logged out from all sessions", null));
});

export const listSessions = asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const sessions = await authService.listSessions(auth.userId, auth.sessionId);
  response.status(200).json(successResponse("Sessions retrieved successfully", sessions));
});

export const revokeSession = asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  await authService.revokeSession(
    auth.userId,
    String(request.params.sessionId),
    auth.sessionId,
    contextFrom(request),
  );
  response.status(200).json(successResponse("Session revoked successfully", null));
});
