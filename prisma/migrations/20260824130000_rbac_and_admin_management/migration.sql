ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_LIST_VIEWED';

CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "contactNumber" VARCHAR(30),
    "profilePhoto" VARCHAR(2048),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admins_userId_key" ON "admins"("userId");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE INDEX "idx_admin_isDeleted" ON "admins"("isDeleted");
CREATE INDEX "idx_admin_name" ON "admins"("name");

ALTER TABLE "admins" ADD CONSTRAINT "admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
