import type { Request } from "express";
import PDFDocument from "pdfkit";

import { ApiError } from "../../errorHelpers/ApiError.js";
import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { paymentService, type PaymentActor } from "./payment.service.js";
import { paymentWebhookService } from "./payment-webhook.service.js";
import {
  adminPaymentActionSchema, adminPaymentDashboardQuerySchema, paymentExportQuerySchema,
  paymentHistoryQuerySchema, refundPaymentSchema,
} from "./payment.validation.js";

const actorFrom = (request: Request): PaymentActor => {
  if (!request.auth) throw new ApiError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { userId: request.auth.userId, role: request.auth.role, profileId: request.auth.profileId };
};
const contextFrom = (request: Request): RequestContext => ({ ipAddress: request.ip, userAgent: request.header("user-agent") });

export const stripeWebhook = asyncHandler(async (request, response) => {
  const signature = request.header("stripe-signature");
  if (!signature || !request.rawBody) throw new ApiError(400, "Stripe signature and raw body are required", "INVALID_WEBHOOK_REQUEST");
  const result = await paymentWebhookService.process(paymentWebhookService.construct(request.rawBody, signature));
  response.status(200).json({ received: true, duplicate: result.duplicate });
});
export const getPayment = asyncHandler(async (request, response) => {
  const result = await paymentService.get(String(request.params.paymentId), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Payment retrieved successfully", result));
});
export const patientPaymentHistory = asyncHandler(async (request, response) => {
  const result = await paymentService.history({ patientId: String(request.params.patientId) }, paymentHistoryQuerySchema.parse(request.query), actorFrom(request));
  response.status(200).json(successResponse("Payment history retrieved successfully", { payments: result.payments, totals: result.totals }, result.meta));
});
export const doctorPaymentHistory = asyncHandler(async (request, response) => {
  const result = await paymentService.history({ doctorId: String(request.params.doctorId) }, paymentHistoryQuerySchema.parse(request.query), actorFrom(request));
  response.status(200).json(successResponse("Payment history retrieved successfully", { payments: result.payments, totals: result.totals }, result.meta));
});
export const adminPaymentHistory = asyncHandler(async (request, response) => {
  const result = await paymentService.history({}, paymentHistoryQuerySchema.parse(request.query), actorFrom(request));
  response.status(200).json(successResponse("Payment history retrieved successfully", { payments: result.payments, totals: result.totals }, result.meta));
});
export const refundPayment = asyncHandler(async (request, response) => {
  const result = await paymentService.refund(String(request.params.paymentId), refundPaymentSchema.parse(request.body), actorFrom(request), contextFrom(request));
  response.status(201).json(successResponse("Refund initiated successfully", result));
});
export const performAdminPaymentAction = asyncHandler(async (request, response) => {
  const result = await paymentService.adminAction(String(request.params.paymentId), adminPaymentActionSchema.parse(request.body), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Payment action completed successfully", result));
});
export const paymentDashboard = asyncHandler(async (request, response) => {
  const result = await paymentService.dashboard(adminPaymentDashboardQuerySchema.parse(request.query), actorFrom(request));
  response.status(200).json(successResponse("Payment dashboard retrieved successfully", result));
});
export const downloadInvoice = asyncHandler(async (request, response) => {
  const result = await paymentService.invoice(String(request.params.paymentId), actorFrom(request), contextFrom(request));
  response.status(200).json(successResponse("Invoice download link generated successfully", result));
});
export const exportPatientPayments = asyncHandler(async (request, response) => {
  const query = paymentExportQuerySchema.parse(request.query);
  const result = await paymentService.history({ patientId: String(request.params.patientId) }, { ...query, limit: 100 }, actorFrom(request));
  if (query.format === "pdf") {
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "attachment; filename=payment-history.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(response);
    doc.fontSize(18).text("PH HealthCare Payment History").moveDown();
    for (const payment of result.payments) doc.fontSize(9).text(`${payment.id} | ${payment.status} | ${payment.currency} ${payment.totalAmount} | ${payment.paidAt?.toISOString() ?? "-"}`);
    doc.end();
    return;
  }
  const rows = ["paymentId,status,currency,amount,tax,total,refunded,paidAt", ...result.payments.map((payment) =>
    [payment.id, payment.status, payment.currency, payment.amount, payment.taxAmount, payment.totalAmount, payment.refundAmount, payment.paidAt?.toISOString() ?? ""].join(","))];
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", "attachment; filename=payment-history.csv");
  response.status(200).send(rows.join("\n"));
});
