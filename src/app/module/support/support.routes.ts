import { Router } from "express";

import { optionalAuthenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createSupportTicket } from "./support.controller.js";
import { supportTicketSchema } from "./support.validation.js";

export const supportRouter = Router();

supportRouter.post(
  "/tickets",
  optionalAuthenticate,
  validate({ body: supportTicketSchema }),
  createSupportTicket,
);
