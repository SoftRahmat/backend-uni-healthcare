import { randomUUID } from "node:crypto";

// Adds a stable correlation ID to every request and response.
import type { RequestHandler } from "express";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export const requestId: RequestHandler = (request, response, next) => {
  const incomingRequestId = request.header("x-request-id");
  request.requestId =
    incomingRequestId && REQUEST_ID_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  response.setHeader("x-request-id", request.requestId);
  next();
};
