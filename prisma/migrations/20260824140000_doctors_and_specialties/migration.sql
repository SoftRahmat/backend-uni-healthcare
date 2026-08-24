CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'SPECIALTY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SPECIALTY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SPECIALTY_DELETED';

CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "contactNumber" VARCHAR(30) NOT NULL,
    "address" VARCHAR(500),
    "registrationNumber" VARCHAR(100) NOT NULL,
    "experience" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "appointmentFee" INTEGER NOT NULL,
    "qualification" VARCHAR(200) NOT NULL,
    "currentWorkingPlace" VARCHAR(200) NOT NULL,
    "designation" VARCHAR(100) NOT NULL,
    "bio" VARCHAR(1000),
    "profilePhoto" VARCHAR(2048),
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doctor_specialties" (
    "doctorId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_specialties_pkey" PRIMARY KEY ("doctorId", "specialtyId")
);

CREATE UNIQUE INDEX "doctors_userId_key" ON "doctors"("userId");
CREATE UNIQUE INDEX "doctors_email_key" ON "doctors"("email");
CREATE UNIQUE INDEX "doctors_registrationNumber_key" ON "doctors"("registrationNumber");
CREATE INDEX "idx_doctor_isDeleted" ON "doctors"("isDeleted");
CREATE INDEX "idx_doctor_gender" ON "doctors"("gender");
CREATE INDEX "idx_doctor_fee" ON "doctors"("appointmentFee");
CREATE INDEX "idx_doctor_rating" ON "doctors"("averageRating");
CREATE INDEX "idx_doctor_specialty_specialtyId" ON "doctor_specialties"("specialtyId");

ALTER TABLE "doctors" ADD CONSTRAINT "doctors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_specialties" ADD CONSTRAINT "doctor_specialties_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_specialties" ADD CONSTRAINT "doctor_specialties_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
