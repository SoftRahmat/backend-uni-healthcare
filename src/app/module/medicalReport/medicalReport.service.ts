import { randomUUID } from "node:crypto";

import type { Prisma } from "../../../generated/prisma/client.js";

import type { PrivateObjectStorage } from "../../config/storage.js";
import { privateObjectStorage } from "../../config/storage.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { prisma } from "../../lib/prisma.js";
import { assertResourceOwnership } from "../../utils/ownershipPolicy.js";
import type { PatientActor } from "../patient/patient.service.js";
import {
  ConfiguredMedicalReportScanner,
  type MedicalReportScanner,
} from "./medicalReport-scanner.service.js";
import type {
  MedicalReportListQuery,
  UploadMedicalReportInput,
} from "./medicalReport.validation.js";

const extensionByMime: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const addYears = (date: Date, years: number): Date => {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
};

export class MedicalReportService {
  constructor(
    private readonly storage: PrivateObjectStorage = privateObjectStorage,
    private readonly scanner: MedicalReportScanner = new ConfiguredMedicalReportScanner(),
  ) {}

  private async authorize(patientId: string, actor: PatientActor) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, isDeleted: false } });
    if (!patient) throw new ApiError(404, "Patient was not found", "PATIENT_NOT_FOUND");
    let ownership = { usedAdminOverride: false };
    if (actor.role === "DOCTOR") {
      const assigned = actor.profileId
        ? await prisma.appointment.findFirst({
            where: {
              patientId,
              doctorId: actor.profileId,
              isDeleted: false,
              status: { not: "CANCELLED" },
            },
            select: { id: true },
          })
        : null;
      if (!assigned) {
        throw new ApiError(
          403,
          "A doctor requires an assigned appointment to access medical reports",
          "PATIENT_ASSIGNMENT_REQUIRED",
        );
      }
    } else {
      ownership = assertResourceOwnership(actor, { ownerUserId: patient.userId });
    }
    return { patient, ownership };
  }

  async upload(
    patientId: string,
    input: UploadMedicalReportInput,
    file: Express.Multer.File | undefined,
    actor: PatientActor,
    context: RequestContext,
  ) {
    const { patient } = await this.authorize(patientId, actor);
    if (actor.role !== "PATIENT") {
      throw new ApiError(403, "Only patients can upload their medical reports", "FORBIDDEN");
    }
    if (!file) throw new ApiError(400, "A medical report file is required", "FILE_REQUIRED");
    const reportCount = await prisma.medicalReport.count({
      where: { patientId, isDeleted: false },
    });
    if (reportCount >= 50)
      throw new ApiError(
        409,
        "A patient can store at most 50 medical reports",
        "REPORT_LIMIT_REACHED",
      );
    await this.scanner.assertSafe(file);

    const extension = extensionByMime[file.mimetype];
    if (!extension)
      throw new ApiError(400, "Medical report file type is invalid", "INVALID_FILE_TYPE");
    const reportId = randomUUID();
    const objectKey = `medical-reports/${patientId}/${reportId}-${Date.now()}.${extension}`;
    const stored = await this.storage.upload({
      objectKey,
      body: file.buffer,
      contentType: file.mimetype,
    });
    try {
      const downloadUrl = await this.storage.signedDownload(stored.objectKey, 60 * 60);
      const report = await prisma.$transaction(async (transaction) => {
        const report = await transaction.medicalReport.create({
          data: {
            id: reportId,
            patientId,
            ...input,
            objectKey: stored.objectKey,
            fileUrl: stored.fileUrl,
            originalFileName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            retentionUntil: addYears(new Date(), 7),
          },
        });
        await transaction.auditLog.create({
          data: {
            action: "MEDICAL_REPORT_UPLOADED",
            userId: patient.userId,
            ...context,
            metadata: {
              actorUserId: actor.userId,
              patientId,
              reportId: report.id,
              mimeType: file.mimetype,
              sizeBytes: file.size,
            },
          },
        });
        return report;
      });
      return {
        id: report.id,
        patientId: report.patientId,
        reportName: report.reportName,
        reportType: report.reportType,
        notes: report.notes,
        fileUrl: downloadUrl,
        expiresInSeconds: 3600,
        createdAt: report.createdAt,
      };
    } catch (error) {
      await this.storage.delete(stored.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async list(
    patientId: string,
    query: MedicalReportListQuery,
    actor: PatientActor,
    context: RequestContext,
  ) {
    const { patient, ownership } = await this.authorize(patientId, actor);
    const where: Prisma.MedicalReportWhereInput = {
      patientId,
      isDeleted: false,
      ...(query.reportType ? { reportType: query.reportType } : {}),
      ...(query.createdFrom || query.createdTo
        ? { createdAt: { gte: query.createdFrom, lte: query.createdTo } }
        : {}),
    };
    const [reports, total] = await prisma.$transaction([
      prisma.medicalReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          reportName: true,
          reportType: true,
          notes: true,
          originalFileName: true,
          mimeType: true,
          sizeBytes: true,
          retentionUntil: true,
          createdAt: true,
          objectKey: true,
        },
      }),
      prisma.medicalReport.count({ where }),
    ]);
    const reportsWithAccess = await Promise.all(
      reports.map(async ({ objectKey, ...report }) => ({
        ...report,
        fileUrl: await this.storage.signedDownload(objectKey, 60 * 60),
        expiresInSeconds: 3600,
      })),
    );
    await prisma.auditLog.create({
      data: {
        action: "MEDICAL_REPORT_VIEWED",
        userId: patient.userId,
        ...context,
        metadata: {
          actorUserId: actor.userId,
          patientId,
          reportIds: reports.map(({ id }) => id),
          adminOverride: ownership.usedAdminOverride,
        },
      },
    });
    return {
      reports: reportsWithAccess,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async access(patientId: string, reportId: string, actor: PatientActor, context: RequestContext) {
    const { patient, ownership } = await this.authorize(patientId, actor);
    const report = await prisma.medicalReport.findFirst({
      where: { id: reportId, patientId, isDeleted: false },
    });
    if (!report)
      throw new ApiError(404, "Medical report was not found", "MEDICAL_REPORT_NOT_FOUND");
    const downloadUrl = await this.storage.signedDownload(report.objectKey, 60 * 60);
    await prisma.auditLog.create({
      data: {
        action: "MEDICAL_REPORT_VIEWED",
        userId: patient.userId,
        ...context,
        metadata: {
          actorUserId: actor.userId,
          patientId,
          reportId,
          adminOverride: ownership.usedAdminOverride,
        },
      },
    });
    return { id: report.id, downloadUrl, expiresInSeconds: 3600 };
  }

  async delete(patientId: string, reportId: string, actor: PatientActor, context: RequestContext) {
    const { patient, ownership } = await this.authorize(patientId, actor);
    const report = await prisma.medicalReport.findFirst({
      where: { id: reportId, patientId, isDeleted: false },
    });
    if (!report)
      throw new ApiError(404, "Medical report was not found", "MEDICAL_REPORT_NOT_FOUND");
    const deletedAt = new Date();
    await prisma.$transaction([
      prisma.medicalReport.update({
        where: { id: reportId },
        data: { isDeleted: true, deletedAt },
      }),
      prisma.auditLog.create({
        data: {
          action: "MEDICAL_REPORT_DELETED",
          userId: patient.userId,
          ...context,
          metadata: {
            actorUserId: actor.userId,
            patientId,
            reportId,
            adminOverride: ownership.usedAdminOverride,
            retainedUntil: report.retentionUntil.toISOString(),
          },
        },
      }),
    ]);
    return { id: reportId, deletedAt, retainedUntil: report.retentionUntil };
  }
}

export const medicalReportService = new MedicalReportService();
