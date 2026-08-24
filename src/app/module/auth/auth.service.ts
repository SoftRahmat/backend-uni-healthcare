import { randomBytes } from "node:crypto";

import { prisma } from "../../lib/prisma.js";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "./auth.validation.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { createOpaqueToken, hashOpaqueToken, signAccessToken } from "../../utils/auth-token.js";
import { hashPassword, isPasswordReused, verifyPassword } from "../../utils/password.js";
import { AuthEmailService } from "./auth-email.service.js";
import type { RequestContext } from "../../interfaces/index.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const MAX_SESSIONS = 5;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const credentialIssuer = "local:credential";

const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "PATIENT";
  status: "PENDING" | "ACTIVE" | "BLOCKED" | "DELETED";
  emailVerified: boolean;
  needPasswordChange: boolean;
  createdAt: Date;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  needPasswordChange: user.needPasswordChange,
  createdAt: user.createdAt,
});

export class AuthService {
  constructor(private readonly emails = new AuthEmailService()) {}

  async register(input: RegisterInput, context: RequestContext) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "Email is already registered", "EMAIL_ALREADY_EXISTS");

    const passwordHash = await hashPassword(input.password);
    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);

    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: { name: input.name, email, role: "PATIENT", status: "PENDING" },
      });
      await transaction.patient.create({
        data: {
          userId: created.id,
          name: input.name,
          email,
          contactNumber: input.contactNumber,
          address: input.address,
        },
      });
      await transaction.account.create({
        data: {
          userId: created.id,
          issuer: credentialIssuer,
          accountId: created.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
      await transaction.passwordHistory.create({
        data: { userId: created.id, passwordHash },
      });
      await transaction.authToken.create({
        data: {
          userId: created.id,
          type: "EMAIL_VERIFICATION",
          tokenHash,
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "USER_REGISTERED",
          userId: created.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return created;
    });
    await this.emails.sendVerification(email, rawToken);

    return publicUser(user);
  }

  async verifyEmail(rawToken: string, context: RequestContext) {
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const token = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!token || token.type !== "EMAIL_VERIFICATION" || token.usedAt || token.expiresAt <= now) {
      throw new ApiError(
        400,
        "Verification token is invalid or expired",
        "INVALID_VERIFICATION_TOKEN",
      );
    }

    const user = await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.authToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new ApiError(
          400,
          "Verification token has already been used",
          "INVALID_VERIFICATION_TOKEN",
        );
      }

      const updated = await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerified: true, status: "ACTIVE" },
      });
      await transaction.authToken.deleteMany({
        where: { userId: token.userId, type: "EMAIL_VERIFICATION", id: { not: token.id } },
      });
      await transaction.auditLog.create({
        data: {
          action: "EMAIL_VERIFIED",
          userId: token.userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return updated;
    });

    return publicUser(user);
  }

  async resendVerification(emailInput: string, context: RequestContext): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "PENDING" || user.emailVerified) return;

    const latest = await prisma.authToken.findFirst({
      where: { userId: user.id, type: "EMAIL_VERIFICATION", usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (latest && latest.createdAt > new Date(Date.now() - 5 * 60 * 1_000)) {
      throw new ApiError(
        429,
        "Verification email was sent recently",
        "VERIFICATION_RESEND_THROTTLED",
      );
    }

    const rawToken = createOpaqueToken();
    await prisma.$transaction([
      prisma.authToken.deleteMany({
        where: { userId: user.id, type: "EMAIL_VERIFICATION" },
      }),
      prisma.authToken.create({
        data: {
          userId: user.id,
          type: "EMAIL_VERIFICATION",
          tokenHash: hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "VERIFICATION_EMAIL_RESENT",
          userId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      }),
    ]);
    await this.emails.sendVerification(email, rawToken);
  }

  async login(input: LoginInput, context: RequestContext) {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: { where: { providerId: "credential", issuer: credentialIssuer } },
        patient: true,
      },
    });

    if (!user || user.status === "DELETED" || user.deletedAt) {
      throw new ApiError(404, "Account was not found", "ACCOUNT_NOT_FOUND");
    }
    if (user.status === "BLOCKED" || user.lockedAt) {
      throw new ApiError(403, "Account is blocked", "ACCOUNT_BLOCKED");
    }
    if (user.status === "PENDING" || !user.emailVerified) {
      throw new ApiError(403, "Verify your email before signing in", "EMAIL_VERIFICATION_REQUIRED");
    }

    const now = new Date();
    const recentFailures = await prisma.loginAttempt.count({
      where: {
        userId: user.id,
        succeeded: false,
        createdAt: { gt: new Date(now.getTime() - LOGIN_WINDOW_MS) },
      },
    });
    if (recentFailures >= 5) {
      throw new ApiError(429, "Too many failed login attempts", "LOGIN_ATTEMPTS_THROTTLED");
    }

    const account = user.accounts[0];
    const validPassword =
      Boolean(account?.password) &&
      (await verifyPassword(input.password, account.password as string));
    if (!validPassword) {
      await this.recordFailedLogin(user.id, email, user.failedLoginAttempts, context);
      throw new ApiError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const session = await prisma.$transaction(async (transaction) => {
      await transaction.session.deleteMany({
        where: { userId: user.id, expiresAt: { lte: now } },
      });
      const sessions = await transaction.session.findMany({
        where: { userId: user.id, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const overflow = sessions.slice(0, Math.max(0, sessions.length - MAX_SESSIONS + 1));
      if (overflow.length) {
        await transaction.session.deleteMany({
          where: { id: { in: overflow.map(({ id }) => id) } },
        });
        await transaction.auditLog.create({
          data: {
            action: "SESSION_AUTO_REVOKED",
            userId: user.id,
            metadata: { count: overflow.length },
          },
        });
      }

      const created = await transaction.session.create({
        data: {
          userId: user.id,
          token: sessionToken,
          expiresAt: new Date(now.getTime() + 7 * DAY_MS),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      await transaction.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          failedLoginAttempts: 0,
          failedLoginWindowStartedAt: null,
        },
      });
      await transaction.loginAttempt.create({
        data: { userId: user.id, email, succeeded: true, ...context },
      });
      await transaction.auditLog.create({
        data: { action: "LOGIN_SUCCEEDED", userId: user.id, ...context },
      });
      return created;
    });

    const accessToken = await signAccessToken({
      userId: user.id,
      sessionId: session.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken,
      expiresIn: 7 * 24 * 60 * 60,
      user: { ...publicUser(user), patient: user.patient },
    };
  }

  private async recordFailedLogin(
    userId: string,
    email: string,
    previousFailures: number,
    context: RequestContext,
  ): Promise<void> {
    const failures = previousFailures + 1;
    const shouldLock = failures >= 10;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: failures,
          failedLoginWindowStartedAt: new Date(),
          ...(shouldLock ? { status: "BLOCKED", lockedAt: new Date() } : {}),
        },
      }),
      prisma.loginAttempt.create({
        data: { userId, email, succeeded: false, ...context },
      }),
      prisma.auditLog.create({
        data: {
          action: shouldLock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
          userId,
          ...context,
          metadata: { failedLoginAttempts: failures },
        },
      }),
    ]);
  }

  async requestPasswordReset(emailInput: string, context: RequestContext): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === "DELETED" || user.deletedAt) return;

    const recentCount = await prisma.authToken.count({
      where: {
        userId: user.id,
        type: "PASSWORD_RESET",
        createdAt: { gt: new Date(Date.now() - HOUR_MS) },
      },
    });
    if (recentCount >= 3) return;

    const rawToken = createOpaqueToken();
    await prisma.$transaction([
      prisma.authToken.updateMany({
        where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.authToken.create({
        data: {
          userId: user.id,
          type: "PASSWORD_RESET",
          tokenHash: hashOpaqueToken(rawToken),
          expiresAt: new Date(Date.now() + HOUR_MS),
        },
      }),
      prisma.auditLog.create({
        data: { action: "PASSWORD_RESET_REQUESTED", userId: user.id, ...context },
      }),
    ]);
    await this.emails.sendPasswordReset(email, rawToken);
  }

  async resetPassword(rawToken: string, password: string, context: RequestContext): Promise<void> {
    const token = await prisma.authToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      include: {
        user: {
          include: {
            accounts: { where: { providerId: "credential", issuer: credentialIssuer } },
            passwordHistory: { orderBy: { createdAt: "desc" }, take: 3 },
          },
        },
      },
    });
    const now = new Date();
    if (!token || token.type !== "PASSWORD_RESET" || token.usedAt || token.expiresAt <= now) {
      throw new ApiError(400, "Password reset token is invalid or expired", "INVALID_RESET_TOKEN");
    }
    if (
      await isPasswordReused(
        password,
        token.user.passwordHistory.map(({ passwordHash }) => passwordHash),
      )
    ) {
      throw new ApiError(
        400,
        "Password must not match your last three passwords",
        "PASSWORD_REUSED",
      );
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.authToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1)
        throw new ApiError(400, "Reset token has already been used", "INVALID_RESET_TOKEN");

      await transaction.account.updateMany({
        where: { userId: token.userId, providerId: "credential", issuer: credentialIssuer },
        data: { password: passwordHash },
      });
      await transaction.passwordHistory.create({ data: { userId: token.userId, passwordHash } });
      await transaction.session.deleteMany({ where: { userId: token.userId } });
      await transaction.authToken.deleteMany({
        where: { userId: token.userId, type: "PASSWORD_RESET" },
      });
      await transaction.user.update({
        where: { id: token.userId },
        data: { needPasswordChange: false },
      });
      await transaction.auditLog.create({
        data: { action: "PASSWORD_RESET_COMPLETED", userId: token.userId, ...context },
      });
      await this.trimPasswordHistory(transaction, token.userId);
    });
    await this.emails.sendPasswordChanged(token.user.email);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        accounts: { where: { providerId: "credential", issuer: credentialIssuer } },
        passwordHistory: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    });
    const account = user.accounts[0];
    if (!account?.password || !(await verifyPassword(input.currentPassword, account.password))) {
      throw new ApiError(400, "Current password is incorrect", "CURRENT_PASSWORD_INCORRECT");
    }
    if (
      await isPasswordReused(
        input.newPassword,
        user.passwordHistory.map(({ passwordHash }) => passwordHash),
      )
    ) {
      throw new ApiError(
        400,
        "Password must not match your last three passwords",
        "PASSWORD_REUSED",
      );
    }

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.$transaction(async (transaction) => {
      await transaction.account.update({
        where: { id: account.id },
        data: { password: passwordHash },
      });
      await transaction.passwordHistory.create({ data: { userId, passwordHash } });
      await transaction.user.update({ where: { id: userId }, data: { needPasswordChange: false } });
      if (input.revokeOtherSessions) {
        await transaction.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
      }
      await transaction.auditLog.create({
        data: { action: "PASSWORD_CHANGED", userId, ...context },
      });
      await this.trimPasswordHistory(transaction, userId);
    });
    await this.emails.sendPasswordChanged(user.email);
  }

  private async trimPasswordHistory(
    transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    userId: string,
  ): Promise<void> {
    const history = await transaction.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (history.length > 3) {
      await transaction.passwordHistory.deleteMany({
        where: { id: { in: history.slice(3).map(({ id }) => id) } },
      });
    }
  }

  async logout(userId: string, sessionId: string, context: RequestContext): Promise<void> {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { id: sessionId, userId } }),
      prisma.auditLog.create({ data: { action: "LOGOUT", userId, ...context } }),
    ]);
  }

  async logoutAll(userId: string, context: RequestContext): Promise<void> {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.auditLog.create({ data: { action: "LOGOUT_ALL", userId, ...context } }),
    ]);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const now = new Date();
    await prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    const sessions = await prisma.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { lastActivityAt: "desc" },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastActivityAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    context: RequestContext,
  ): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new ApiError(
        400,
        "Use logout to terminate the current session",
        "CURRENT_SESSION_REVOKE_DENIED",
      );
    }
    const result = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
    if (!result.count) throw new ApiError(404, "Session was not found", "SESSION_NOT_FOUND");
    await prisma.auditLog.create({ data: { action: "SESSION_REVOKED", userId, ...context } });
  }
}

export const authService = new AuthService();
