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
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(3).default("ph-healthcare-private"),
  S3_ENDPOINT: z.url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false")
    .transform((value) => value === "true"),
  VIRUS_SCAN_URL: z.url().optional(),
  VIRUS_SCAN_API_KEY: z.string().min(1).optional(),
  SCHEDULE_TIME_ZONE: z.string().min(1).default("UTC"),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CURRENCY: z.string().length(3).default("usd").transform((value) => value.toLowerCase()),
  PAYMENT_SUCCESS_URL: z.url().default("http://localhost:3000/payments/success?session_id={CHECKOUT_SESSION_ID}"),
  PAYMENT_CANCEL_URL: z.url().default("http://localhost:3000/payments/cancelled"),
  INVOICE_COMPANY_NAME: z.string().min(1).default("PH HealthCare"),
  INVOICE_COMPANY_ADDRESS: z.string().min(1).default("Healthcare Services"),
  INVOICE_TAX_ID: z.string().default(""),
  INVOICE_TAX_RATE_BPS: z.coerce.number().int().min(0).max(10_000).default(0),
  INVOICE_CURRENCY_SYMBOL: z.string().min(1).max(5).default("$"),
}).superRefine((value, context) => {
  if (Boolean(value.S3_ACCESS_KEY_ID) !== Boolean(value.S3_SECRET_ACCESS_KEY)) {
    context.addIssue({
      code: "custom",
      path: ["S3_ACCESS_KEY_ID"],
      message: "S3 access key ID and secret access key must be configured together",
    });
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value.SCHEDULE_TIME_ZONE }).format(new Date());
  } catch {
    context.addIssue({
      code: "custom",
      path: ["SCHEDULE_TIME_ZONE"],
      message: "Schedule timezone must be a valid IANA timezone",
    });
  }
  if (value.NODE_ENV === "production" && (!value.STRIPE_SECRET_KEY || !value.STRIPE_WEBHOOK_SECRET)) {
    context.addIssue({
      code: "custom",
      path: ["STRIPE_SECRET_KEY"],
      message: "Stripe secret and webhook signing secret are required in production",
    });
  }
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
