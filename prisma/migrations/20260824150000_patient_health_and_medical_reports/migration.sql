CREATE TYPE "BloodGroup" AS ENUM ('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE');
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');
CREATE TYPE "ReportType" AS ENUM ('LAB_TEST', 'IMAGING', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'OTHER');

ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_LIST_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_DETAIL_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_HEALTH_DATA_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_REPORT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_REPORT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_REPORT_DELETED';

ALTER TABLE "patients" ADD COLUMN "profilePhoto" VARCHAR(2048);

CREATE TABLE "patient_health_data" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "bloodGroup" "BloodGroup",
    "maritalStatus" "MaritalStatus",
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "allergies" VARCHAR(1000),
    "chronicConditions" VARCHAR(1000),
    "currentMedications" VARCHAR(1000),
    "familyMedicalHistory" VARCHAR(2000),
    "emergencyContactName" VARCHAR(100),
    "emergencyContactPhone" VARCHAR(30),
    "smokingStatus" BOOLEAN,
    "alcoholConsumption" BOOLEAN,
    "dietaryPreferences" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_health_data_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "medical_reports" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reportName" VARCHAR(200) NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "notes" VARCHAR(1000),
    "objectKey" VARCHAR(1024) NOT NULL,
    "fileUrl" VARCHAR(2048) NOT NULL,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "storageDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "medical_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_health_data_patientId_key" ON "patient_health_data"("patientId");
CREATE UNIQUE INDEX "medical_reports_objectKey_key" ON "medical_reports"("objectKey");
CREATE INDEX "idx_medical_report_patient_created" ON "medical_reports"("patientId", "createdAt" DESC);
CREATE INDEX "idx_medical_report_type" ON "medical_reports"("reportType");
CREATE INDEX "idx_medical_report_isDeleted" ON "medical_reports"("isDeleted");

ALTER TABLE "patient_health_data" ADD CONSTRAINT "patient_health_data_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_reports" ADD CONSTRAINT "medical_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
