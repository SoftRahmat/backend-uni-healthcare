import { prisma } from "../../lib/prisma.js";
import { logger } from "../../config/logger.js";

export const cleanupExpiredAuthRecords = async (): Promise<void> => {
  const now = new Date();
  const [sessions, tokens, verifications, attempts] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.authToken.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] },
    }),
    prisma.verification.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.loginAttempt.deleteMany({
      where: { createdAt: { lte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000) } },
    }),
  ]);

  logger.info("Expired authentication records cleaned", {
    sessions: sessions.count,
    tokens: tokens.count,
    verifications: verifications.count,
    attempts: attempts.count,
  });
};
