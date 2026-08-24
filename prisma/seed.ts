import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { PrismaClient } from "../src/generated/prisma/client.js";

const seedEnvironment = z.object({
  DATABASE_URL: z.string().min(1),
  SEED_SUPER_ADMIN_NAME: z.string().min(2).max(100).default("System Super Admin"),
  SEED_SUPER_ADMIN_EMAIL: z.email(),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).max(128),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
}).parse(process.env);

const adapter = new PrismaPg({ connectionString: seedEnvironment.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const seed = async (): Promise<void> => {
  const email = seedEnvironment.SEED_SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(
    seedEnvironment.SEED_SUPER_ADMIN_PASSWORD,
    seedEnvironment.BCRYPT_ROUNDS,
  );

  await prisma.$transaction(async (transaction) => {
    const existing = await transaction.user.findUnique({
      where: { email },
      include: { admin: true },
    });
    if (existing && !existing.admin) {
      throw new Error("Seed email belongs to a non-administrator account");
    }

    const user = existing ?? await transaction.user.create({
      data: {
        name: seedEnvironment.SEED_SUPER_ADMIN_NAME,
        email,
        emailVerified: true,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        needPasswordChange: true,
      },
    });
    await transaction.user.update({
      where: { id: user.id },
      data: {
        name: seedEnvironment.SEED_SUPER_ADMIN_NAME,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        emailVerified: true,
      },
    });
    await transaction.admin.upsert({
      where: { userId: user.id },
      create: { userId: user.id, name: seedEnvironment.SEED_SUPER_ADMIN_NAME, email },
      update: { name: seedEnvironment.SEED_SUPER_ADMIN_NAME, email, isDeleted: false, deletedAt: null },
    });
    await transaction.account.upsert({
      where: {
        account_issuer_accountId_key: { issuer: "local:credential", accountId: user.id },
      },
      create: {
        userId: user.id,
        issuer: "local:credential",
        accountId: user.id,
        providerId: "credential",
        password: passwordHash,
      },
      update: { password: passwordHash },
    });
    await transaction.passwordHistory.deleteMany({ where: { userId: user.id } });
    await transaction.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  });
};

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
