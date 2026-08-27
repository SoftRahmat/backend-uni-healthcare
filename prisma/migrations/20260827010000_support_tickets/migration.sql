ALTER TYPE "AuditAction" ADD VALUE 'SUPPORT_TICKET_CREATED';

CREATE TYPE "SupportTicketCategory" AS ENUM ('ACCOUNT', 'APPOINTMENT', 'PAYMENT', 'PRESCRIPTION', 'PRIVACY', 'TECHNICAL', 'OTHER');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "support_tickets" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "category" "SupportTicketCategory" NOT NULL,
  "subject" VARCHAR(160) NOT NULL,
  "message" VARCHAR(5000) NOT NULL,
  "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_support_ticket_email_created" ON "support_tickets"("email", "createdAt" DESC);
CREATE INDEX "idx_support_ticket_status_created" ON "support_tickets"("status", "createdAt" DESC);
CREATE INDEX "idx_support_ticket_user_created" ON "support_tickets"("userId", "createdAt" DESC);

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
