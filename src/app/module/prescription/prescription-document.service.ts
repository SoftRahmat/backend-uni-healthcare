import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { env } from "../../config/env.js";
import { privateObjectStorage, type PrivateObjectStorage } from "../../config/storage.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { prisma } from "../../lib/prisma.js";

const tokenFor = (id: string, version: number) =>
  createHmac("sha256", env.JWT_SECRET).update(`${id}:${version}`).digest("hex");
export const verifyPrescriptionToken = (id: string, version: number, supplied: string) => {
  const expected = Buffer.from(tokenFor(id, version));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
const include = {
  doctor: { include: { specialties: { include: { specialty: true } } } },
  patient: { include: { healthData: true } },
  appointment: { include: { schedule: true } },
  medicines: { orderBy: { sortOrder: "asc" as const } },
  versions: { orderBy: { version: "desc" as const } },
} as const;
const age = (birth?: Date | null) =>
  birth ? Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;

export class PrescriptionDocumentService {
  constructor(private readonly storage: PrivateObjectStorage = privateObjectStorage) {}

  async generate(prescriptionId: string): Promise<{
    record: { objectKey: string; fileUrl: string; sizeBytes: number };
    body: Buffer;
    downloadUrl: string;
    expiresAt: Date;
  }> {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include,
    });
    if (!prescription)
      throw new ApiError(404, "Prescription was not found", "PRESCRIPTION_NOT_FOUND");
    const current = prescription.versions.find((item) => item.version === prescription.version);
    if (!current)
      throw new ApiError(500, "Prescription version is missing", "PRESCRIPTION_VERSION_MISSING");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    if (current.objectKey && current.fileUrl && current.sizeBytes) {
      return {
        record: {
          objectKey: current.objectKey,
          fileUrl: current.fileUrl,
          sizeBytes: current.sizeBytes,
        },
        body: Buffer.alloc(0),
        downloadUrl: await this.storage.signedDownload(current.objectKey, 86_400),
        expiresAt,
      };
    }
    const verificationUrl = `${env.APP_BASE_URL}/api/v1/prescriptions/${prescription.id}/verify?token=${tokenFor(prescription.id, prescription.version)}&version=${prescription.version}`;
    const qr = await QRCode.toBuffer(verificationUrl, {
      type: "png",
      width: 120,
      margin: 1,
      errorCorrectionLevel: "H",
    });
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: prescription.prescriptionNumber },
    });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc
      .save()
      .opacity(0.08)
      .fontSize(48)
      .rotate(-35, { origin: [300, 400] })
      .text("VALID PRESCRIPTION", 80, 380, { align: "center" })
      .restore();
    doc.fontSize(22).text(env.INVOICE_COMPANY_NAME).fontSize(10).text(env.INVOICE_COMPANY_ADDRESS);
    if (env.INVOICE_COMPANY_PHONE) doc.text(`Phone: ${env.INVOICE_COMPANY_PHONE}`);
    if (env.INVOICE_COMPANY_EMAIL) doc.text(`Email: ${env.INVOICE_COMPANY_EMAIL}`);
    doc.moveDown();
    doc
      .fontSize(18)
      .text("PRESCRIPTION", { align: "center" })
      .fontSize(10)
      .text(`Prescription No: ${prescription.prescriptionNumber}`)
      .text(`Version: ${prescription.version}`)
      .text(`Issued: ${prescription.createdAt.toISOString().slice(0, 10)}`)
      .moveDown();
    doc
      .text(`Doctor: ${prescription.doctor.name}`)
      .text(`License: ${prescription.doctor.registrationNumber}`)
      .text(
        `Specialty: ${prescription.doctor.specialties.map((item) => item.specialty.title).join(", ") || "General"}`,
      )
      .moveDown();
    doc
      .text(`Patient: ${prescription.patient.name}`)
      .text(`Age: ${age(prescription.patient.healthData?.dateOfBirth) ?? "Not recorded"}`)
      .text(
        `Service date: ${prescription.appointment.schedule.scheduleDate.toISOString().slice(0, 10)}`,
      )
      .moveDown();
    doc.fontSize(14).text("Rx").fontSize(10);
    for (const medicine of prescription.medicines)
      doc.text(
        `${medicine.name} — ${medicine.dosage}, ${medicine.frequency}, ${medicine.duration}${medicine.instructions ? ` (${medicine.instructions})` : ""}`,
      );
    if (prescription.medicines.length) doc.moveDown();
    doc.text(prescription.instructions).moveDown();
    doc
      .text(`Follow-up: ${prescription.followUpDate?.toISOString().slice(0, 10) ?? "Not required"}`)
      .moveDown(2);
    doc.text(
      `Digitally signed by ${prescription.doctor.name}\nLicense ${prescription.doctor.registrationNumber}`,
    );
    doc
      .image(qr, 420, 650, { width: 100 })
      .fontSize(7)
      .text("Scan to verify authenticity", 410, 755, { width: 120, align: "center" });
    doc.end();
    const body = await complete;
    const objectKey = `prescriptions/${prescription.id}/${prescription.prescriptionNumber}-v${prescription.version}.pdf`;
    const uploaded = await this.storage.upload({ objectKey, body, contentType: "application/pdf" });
    const checksum = createHash("sha256").update(body).digest("hex");
    const saved = await prisma.$transaction(async (tx) => {
      const version = await tx.prescriptionVersion.update({
        where: { id: current.id },
        data: { ...uploaded, checksum, sizeBytes: body.length },
      });
      await tx.auditLog.create({
        data: {
          action: "PRESCRIPTION_PDF_GENERATED",
          metadata: { prescriptionId, version: prescription.version, checksum },
        },
      });
      return version;
    });
    return {
      record: { objectKey: saved.objectKey!, fileUrl: saved.fileUrl!, sizeBytes: saved.sizeBytes! },
      body,
      downloadUrl: await this.storage.signedDownload(objectKey, 86_400),
      expiresAt,
    };
  }
}
export const prescriptionDocumentService = new PrescriptionDocumentService();
