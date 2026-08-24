CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'PATIENT');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED', 'DELETED');
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTERED', 'EMAIL_VERIFIED', 'VERIFICATION_EMAIL_RESENT', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED', 'LOGOUT', 'LOGOUT_ALL', 'SESSION_REVOKED', 'SESSION_AUTO_REVOKED');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" VARCHAR(2048),
    "role" "UserRole" NOT NULL DEFAULT 'PATIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "needPasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "failedLoginWindowStartedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "contactNumber" VARCHAR(30),
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "issuer" VARCHAR(255) NOT NULL,
    "accountId" VARCHAR(255) NOT NULL,
    "providerId" VARCHAR(100) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" VARCHAR(255),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" VARCHAR(320) NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "userId" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "userId" TEXT,
    "ipAddress" VARCHAR(64),
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_user_role_status" ON "users"("role", "status");
CREATE INDEX "idx_user_status" ON "users"("status");
CREATE UNIQUE INDEX "patients_userId_key" ON "patients"("userId");
CREATE UNIQUE INDEX "patients_email_key" ON "patients"("email");
CREATE INDEX "idx_patient_isDeleted" ON "patients"("isDeleted");
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "idx_session_userId" ON "sessions"("userId");
CREATE INDEX "idx_session_expiresAt" ON "sessions"("expiresAt");
CREATE INDEX "idx_account_userId" ON "accounts"("userId");
CREATE UNIQUE INDEX "accounts_issuer_accountId_key" ON "accounts"("issuer", "accountId");
CREATE INDEX "idx_verification_identifier" ON "verifications"("identifier");
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX "idx_auth_token_user_type_created" ON "auth_tokens"("userId", "type", "createdAt");
CREATE INDEX "idx_auth_token_expiresAt" ON "auth_tokens"("expiresAt");
CREATE INDEX "idx_password_history_user_created" ON "password_history"("userId", "createdAt" DESC);
CREATE INDEX "idx_login_attempt_email_created" ON "login_attempts"("email", "createdAt");
CREATE INDEX "idx_login_attempt_user_created" ON "login_attempts"("userId", "createdAt");
CREATE INDEX "idx_audit_log_user_created" ON "audit_logs"("userId", "createdAt");
CREATE INDEX "idx_audit_log_action_created" ON "audit_logs"("action", "createdAt");

ALTER TABLE "patients" ADD CONSTRAINT "patients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
