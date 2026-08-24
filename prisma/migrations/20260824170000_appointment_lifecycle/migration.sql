CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'INPROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIAL_REFUND');
CREATE TYPE "RefundType" AS ENUM ('NONE', 'FULL', 'PARTIAL');

ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_BOOKED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_LIST_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_DETAIL_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_STATUS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_AUTO_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_PAYMENT_EXPIRED';

CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "appointmentFee" INTEGER NOT NULL,
    "notes" VARCHAR(1000),
    "videoCallingId" VARCHAR(100) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" VARCHAR(100),
    "cancelledByRole" "UserRole",
    "cancellationReason" VARCHAR(500),
    "refundType" "RefundType" NOT NULL DEFAULT 'NONE',
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentLink" VARCHAR(2048),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "transactionId" VARCHAR(255),
    "paidAt" TIMESTAMP(3),
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "stripeRefundId" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointments_videoCallingId_key" ON "appointments"("videoCallingId");
CREATE UNIQUE INDEX "idx_active_appointment_schedule" ON "appointments"("scheduleId")
WHERE "status" IN ('SCHEDULED', 'INPROGRESS') AND "isDeleted" = false;
CREATE INDEX "idx_appointment_patient_status" ON "appointments"("patientId", "status");
CREATE INDEX "idx_appointment_doctor_status" ON "appointments"("doctorId", "status");
CREATE INDEX "idx_appointment_scheduleId" ON "appointments"("scheduleId");
CREATE INDEX "idx_appointment_status_created" ON "appointments"("status", "createdAt");
CREATE INDEX "idx_appointment_isDeleted" ON "appointments"("isDeleted");

CREATE UNIQUE INDEX "payments_appointmentId_key" ON "payments"("appointmentId");
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");
CREATE UNIQUE INDEX "payments_stripeRefundId_key" ON "payments"("stripeRefundId");
CREATE INDEX "idx_payment_status_created" ON "payments"("status", "createdAt");
CREATE INDEX "idx_payment_expiresAt" ON "payments"("expiresAt");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
