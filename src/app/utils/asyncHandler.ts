import type { RequestHandler } from "express";

// Converts rejected async handlers into Express error middleware calls.

export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
