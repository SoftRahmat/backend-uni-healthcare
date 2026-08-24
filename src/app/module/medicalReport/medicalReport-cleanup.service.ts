import type { PrivateObjectStorage } from "../../config/storage.js";
import { privateObjectStorage } from "../../config/storage.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../lib/prisma.js";

export const PATIENT_REPORT_STORAGE_GRACE_DAYS = 90;

export const cleanupDeletedPatientReportFiles = async (
  storage: PrivateObjectStorage = privateObjectStorage,
  now = new Date(),
): Promise<number> => {
  const deletionCutoff = new Date(
    now.getTime() - PATIENT_REPORT_STORAGE_GRACE_DAYS * 24 * 60 * 60 * 1_000,
  );
  const reports = await prisma.medicalReport.findMany({
    where: {
      storageDeletedAt: null,
      patient: { isDeleted: true, deletedAt: { lte: deletionCutoff } },
    },
    select: { id: true, objectKey: true, patientId: true, patient: { select: { userId: true } } },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  let deleted = 0;
  for (const report of reports) {
    try {
      await storage.delete(report.objectKey);
      await prisma.$transaction([
        prisma.medicalReport.update({
          where: { id: report.id },
          data: { storageDeletedAt: now, isDeleted: true, deletedAt: now },
        }),
        prisma.auditLog.create({
          data: {
            action: "MEDICAL_REPORT_DELETED",
            userId: report.patient.userId,
            metadata: {
              patientId: report.patientId,
              reportId: report.id,
              reason: "PATIENT_ACCOUNT_DELETED_90_DAYS_AGO",
              storageDeletedAt: now.toISOString(),
            },
          },
        }),
      ]);
      deleted += 1;
    } catch (error) {
      logger.error("Medical report storage cleanup failed", { reportId: report.id, error });
    }
  }

  if (deleted > 0) logger.info("Deleted patient medical report files cleaned", { deleted });
  return deleted;
};
