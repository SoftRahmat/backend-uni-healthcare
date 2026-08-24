CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_INITIATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_WEBHOOK_PROCESSED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_STATUS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_REFUNDED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_ADMIN_ACTION';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'INVOICE_DOWNLOADED';

ALTER TABLE "payments" ADD COLUMN "stripePaymentIntentId" VARCHAR(255), ADD COLUMN "stripeCheckoutSessionId" VARCHAR(255), ADD COLUMN "paymentMethod" VARCHAR(50), ADD COLUMN "cardLast4" CHAR(4), ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "notes" VARCHAR(1000);
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");
CREATE UNIQUE INDEX "payments_stripeCheckoutSessionId_key" ON "payments"("stripeCheckoutSessionId");

CREATE TABLE "payment_attempts" ("id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "providerAttemptId" VARCHAR(255), "status" "PaymentStatus" NOT NULL, "amount" INTEGER NOT NULL, "failureCode" VARCHAR(100), "failureMessage" VARCHAR(1000), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"));
CREATE TABLE "refunds" ("id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "stripeRefundId" VARCHAR(255) NOT NULL, "amount" INTEGER NOT NULL, "reason" VARCHAR(500), "status" VARCHAR(50) NOT NULL, "estimatedArrival" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"));
CREATE TABLE "stripe_webhook_events" ("id" TEXT NOT NULL, "stripeEventId" VARCHAR(255) NOT NULL, "eventType" VARCHAR(150) NOT NULL, "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'PROCESSING', "payload" JSONB NOT NULL, "errorMessage" VARCHAR(1000), "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id"));
CREATE TABLE "invoices" ("id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "invoiceNumber" VARCHAR(100) NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "objectKey" VARCHAR(1024) NOT NULL, "fileUrl" VARCHAR(2048) NOT NULL, "checksum" CHAR(64) NOT NULL, "subtotal" INTEGER NOT NULL, "taxRateBps" INTEGER NOT NULL, "taxAmount" INTEGER NOT NULL, "totalAmount" INTEGER NOT NULL, "retentionUntil" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"));

CREATE INDEX "idx_payment_attempt_payment_created" ON "payment_attempts"("paymentId", "createdAt" DESC);
CREATE UNIQUE INDEX "refunds_stripeRefundId_key" ON "refunds"("stripeRefundId");
CREATE INDEX "idx_refund_payment_created" ON "refunds"("paymentId", "createdAt" DESC);
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");
CREATE INDEX "idx_stripe_webhook_type_created" ON "stripe_webhook_events"("eventType", "createdAt");
CREATE INDEX "idx_stripe_webhook_status_created" ON "stripe_webhook_events"("status", "createdAt");
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE UNIQUE INDEX "invoices_objectKey_key" ON "invoices"("objectKey");
CREATE UNIQUE INDEX "invoice_payment_version_key" ON "invoices"("paymentId", "version");
CREATE INDEX "idx_invoice_payment_created" ON "invoices"("paymentId", "createdAt" DESC);

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
