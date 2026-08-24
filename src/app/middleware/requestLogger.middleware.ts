import type { RequestHandler } from "express";

// Emits one structured completion log for each request.

import { logger } from "../config/logger.js";

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.http("Request completed", {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
};
