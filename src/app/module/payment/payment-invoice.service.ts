import { createHash } from "node:crypto";

import PDFDocument from "pdfkit";

import { env } from "../../config/env.js";
import { privateObjectStorage, type PrivateObjectStorage } from "../../config/storage.js";
import { ApiError } from "../../errorHelpers/ApiError.js";
import { prisma } from "../../lib/prisma.js";

const paymentInvoiceInclude = {
  appointment: { include: { patient: true, doctor: true, schedule: true } },
} as const;
const money = (amount: number) => `${env.INVOICE_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

type InvoicePayment = NonNullable<Awaited<ReturnType<typeof loadPayment>>>;
const renderPdf = async (payment: InvoicePayment, invoiceNumber: string): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: { Title: `Invoice ${invoiceNumber}` },
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.fontSize(22).text(env.INVOICE_COMPANY_NAME).fontSize(10).text(env.INVOICE_COMPANY_ADDRESS);
  if (env.INVOICE_TAX_ID) doc.text(`Tax ID: ${env.INVOICE_TAX_ID}`);
  doc.moveDown(2).fontSize(18).text("PAYMENT INVOICE");
  doc.fontSize(10).text(`Invoice: ${invoiceNumber}`).text(`Issued: ${new Date().toISOString()}`);
  doc
    .moveDown()
    .text(`Patient: ${payment.appointment.patient.name}`)
    .text(`Doctor: ${payment.appointment.doctor.name}`);
  doc.text(
    `Service date: ${payment.appointment.schedule.scheduleDate.toISOString().slice(0, 10)} ${payment.appointment.schedule.startTime}`,
  );
  doc
    .moveDown()
    .text("Medical consultation", 50, doc.y, { continued: true })
    .text(money(payment.amount), { align: "right" });
  doc
    .text(`Tax (${(payment.taxRateBps / 100).toFixed(2)}%)`, 50, doc.y, { continued: true })
    .text(money(payment.taxAmount), { align: "right" });
  doc
    .moveDown()
    .fontSize(12)
    .text("Total", 50, doc.y, { continued: true })
    .text(money(payment.amount + payment.taxAmount), { align: "right" });
  doc
    .moveDown(2)
    .fontSize(9)
    .text(`Payment status: ${payment.status}`)
    .text(`Transaction: ${payment.transactionId ?? payment.stripePaymentIntentId ?? "Pending"}`);
  doc
    .moveDown(4)
    .fillColor("#666666")
    .text("This invoice is digitally generated and retained in the PH HealthCare archive.", {
      align: "center",
    });
  doc.end();
  return complete;
};
const loadPayment = (paymentId: string) =>
  prisma.payment.findFirst({
    where: { id: paymentId, isDeleted: false },
    include: paymentInvoiceInclude,
  });

export class PaymentInvoiceService {
  constructor(private readonly storage: PrivateObjectStorage = privateObjectStorage) {}

  async generate(paymentId: string, newVersion = false) {
    const existing = await prisma.invoice.findFirst({
      where: { paymentId },
      orderBy: { version: "desc" },
    });
    if (existing && !newVersion) return existing;
    const payment = await loadPayment(paymentId);
    if (!payment) throw new ApiError(404, "Payment was not found", "PAYMENT_NOT_FOUND");
    if (!["PAID", "REFUNDED", "PARTIAL_REFUND"].includes(payment.status))
      throw new ApiError(409, "Only settled payments can be invoiced", "PAYMENT_NOT_SETTLED");
    const version = (existing?.version ?? 0) + 1;
    const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${payment.id.slice(0, 8).toUpperCase()}-V${version}`;
    const body = await renderPdf(payment, invoiceNumber);
    const objectKey = `invoices/${payment.id}/${invoiceNumber}.pdf`;
    const uploaded = await this.storage.upload({ objectKey, body, contentType: "application/pdf" });
    try {
      return await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            paymentId,
            invoiceNumber,
            version,
            ...uploaded,
            checksum: createHash("sha256").update(body).digest("hex"),
            subtotal: payment.amount,
            taxRateBps: payment.taxRateBps,
            taxAmount: payment.taxAmount,
            totalAmount: payment.amount + payment.taxAmount,
            retentionUntil: new Date(Date.now() + 7 * 365.25 * 24 * 60 * 60 * 1_000),
          },
        });
        await tx.auditLog.create({
          data: {
            action: "INVOICE_GENERATED",
            metadata: { paymentId, invoiceId: invoice.id, invoiceNumber, version },
          },
        });
        return invoice;
      });
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async download(paymentId: string) {
    const invoice = await this.generate(paymentId);
    return {
      ...invoice,
      downloadUrl: await this.storage.signedDownload(invoice.objectKey, 24 * 60 * 60),
    };
  }
}

export const paymentInvoiceService = new PaymentInvoiceService();
