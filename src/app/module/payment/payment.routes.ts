import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeExact } from "../../middleware/rbac.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  adminPaymentHistory,
  doctorPaymentHistory,
  downloadInvoice,
  exportPatientPayments,
  getPayment,
  patientPaymentHistory,
  paymentDashboard,
  performAdminPaymentAction,
  refundPayment,
  stripeWebhook,
} from "./payment.controller.js";
import {
  adminPaymentActionSchema,
  adminPaymentDashboardQuerySchema,
  doctorPaymentParamsSchema,
  patientPaymentParamsSchema,
  paymentExportQuerySchema,
  paymentHistoryQuerySchema,
  paymentIdParamsSchema,
  refundPaymentSchema,
} from "./payment.validation.js";

export const paymentRouter = Router();
paymentRouter.post("/webhooks/stripe", stripeWebhook);
paymentRouter.use(authenticate);
paymentRouter.get(
  "/admin/dashboard",
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  validate({ query: adminPaymentDashboardQuerySchema }),
  paymentDashboard,
);
paymentRouter.get(
  "/admin/history",
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  validate({ query: paymentHistoryQuerySchema }),
  adminPaymentHistory,
);
paymentRouter.get(
  "/history/patient/:patientId",
  authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"),
  validate({ params: patientPaymentParamsSchema, query: paymentHistoryQuerySchema }),
  patientPaymentHistory,
);
paymentRouter.get(
  "/history/patient/:patientId/export",
  authorizeExact("PATIENT", "ADMIN", "SUPER_ADMIN"),
  validate({ params: patientPaymentParamsSchema, query: paymentExportQuerySchema }),
  exportPatientPayments,
);
paymentRouter.get(
  "/history/doctor/:doctorId",
  authorizeExact("DOCTOR", "ADMIN", "SUPER_ADMIN"),
  validate({ params: doctorPaymentParamsSchema, query: paymentHistoryQuerySchema }),
  doctorPaymentHistory,
);
paymentRouter.get("/:paymentId", validate({ params: paymentIdParamsSchema }), getPayment);
paymentRouter.get(
  "/:paymentId/invoice",
  validate({ params: paymentIdParamsSchema }),
  downloadInvoice,
);
paymentRouter.post(
  "/:paymentId/refunds",
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  validate({ params: paymentIdParamsSchema, body: refundPaymentSchema }),
  refundPayment,
);
paymentRouter.post(
  "/:paymentId/admin-actions",
  authorizeExact("ADMIN", "SUPER_ADMIN"),
  validate({ params: paymentIdParamsSchema, body: adminPaymentActionSchema }),
  performAdminPaymentAction,
);
