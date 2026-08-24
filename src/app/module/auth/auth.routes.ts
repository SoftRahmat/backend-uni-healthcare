import { Router } from "express";

import {
  changePassword,
  forgotPassword,
  listSessions,
  login,
  logout,
  logoutAll,
  register,
  resendVerification,
  resetPassword,
  revokeSession,
  verifyEmail,
} from "./auth.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authRateLimiter } from "../../middleware/rateLimit.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  changePasswordSchema,
  emailSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "./auth.validation.js";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, validate({ body: registerSchema }), register);
authRouter.post("/verify-email", authRateLimiter, validate({ body: tokenSchema }), verifyEmail);
authRouter.post(
  "/resend-verification",
  authRateLimiter,
  validate({ body: emailSchema }),
  resendVerification,
);
authRouter.post("/login", authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post(
  "/forgot-password",
  authRateLimiter,
  validate({ body: emailSchema }),
  forgotPassword,
);
authRouter.post(
  "/reset-password",
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
);
authRouter.post(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  changePassword,
);
authRouter.post("/logout", authenticate, logout);
authRouter.post("/logout-all", authenticate, logoutAll);
authRouter.get("/sessions", authenticate, listSessions);
authRouter.delete("/sessions/:sessionId", authenticate, revokeSession);
