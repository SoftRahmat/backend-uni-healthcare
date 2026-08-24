import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { env } from "./env.js";

export const auth = betterAuth({
  appName: "PH-HealthCare",
  baseURL: env.APP_BASE_URL,
  basePath: "/internal/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      verify: ({ password, hash }) => verifyPassword(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      lastActivityAt: { type: "date", required: true, defaultValue: () => new Date() },
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "PATIENT", input: false },
      status: { type: "string", required: true, defaultValue: "PENDING", input: false },
      needPasswordChange: { type: "boolean", required: true, defaultValue: false, input: false },
    },
  },
  plugins: [bearer()],
});
