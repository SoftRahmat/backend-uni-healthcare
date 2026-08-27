import type { Request } from "express";

import type { RequestContext } from "../../interfaces/index.js";
import { successResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { supportService } from "./support.service.js";
import { supportTicketSchema } from "./support.validation.js";

const contextFrom = (request: Request): RequestContext => ({
  ipAddress: request.ip,
  userAgent: request.header("user-agent"),
});

export const createSupportTicket = asyncHandler(async (request, response) => {
  const result = await supportService.createTicket(
    supportTicketSchema.parse(request.body),
    request.auth ? { userId: request.auth.userId } : undefined,
    contextFrom(request),
  );

  response.status(201).json(successResponse("Support request received", result));
});
