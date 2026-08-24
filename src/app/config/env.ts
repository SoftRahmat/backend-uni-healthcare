import "dotenv/config";

// Central runtime configuration for the application layer.
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5_000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  REQUEST_BODY_LIMIT: z.string().regex(/^\d+(?:b|kb|mb)?$/i).default("1mb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  APP_BASE_URL: z.url().default("http://localhost:5000"),
  CLIENT_BASE_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  EMAIL_FROM: z.email().default("no-reply@ph-healthcare.local"),
});

const runtimeEnvironment = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === "test"
      ? "postgresql://postgres:postgres@localhost:5432/ph_healthcare_test"
      : undefined),
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "test" ? "test-better-auth-secret-at-least-32-characters" : undefined),
  JWT_SECRET:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "test" ? "test-jwt-signing-secret-at-least-32-characters" : undefined),
};

const parsedEnvironment = environmentSchema.safeParse(runtimeEnvironment);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = Object.freeze(parsedEnvironment.data);
