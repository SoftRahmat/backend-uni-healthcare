ALTER TYPE "AuditAction" ADD VALUE 'SCHEDULE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHEDULE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SCHEDULE_DELETED';

CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "scheduleDate" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_time_order_check" CHECK ("startTime" < "endTime")
);

CREATE TABLE "doctor_schedules" (
    "doctorId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("doctorId", "scheduleId")
);

CREATE INDEX "idx_schedule_date_start" ON "schedules"("scheduleDate", "startTime");
CREATE INDEX "idx_schedule_booking_deleted" ON "schedules"("isBooked", "isDeleted");
CREATE INDEX "idx_doctor_schedule_scheduleId" ON "doctor_schedules"("scheduleId");
CREATE INDEX "idx_doctor_schedule_doctor_active" ON "doctor_schedules"("doctorId", "isActive");

ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctorId_fkey"
FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
