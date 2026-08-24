import type { RequestHandler } from "express";

import { ApiError } from "../errorHelpers/ApiError.js";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, `Route ${request.method} ${request.path} was not found`, "ROUTE_NOT_FOUND"));
};
