import type { RequestHandler } from "express";

// Reusable Zod boundary for module-owned request contracts.
import type { ZodType } from "zod";

type RequestSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (request, _response, next) => {
    try {
      if (schemas.body) request.body = schemas.body.parse(request.body);
      if (schemas.query) schemas.query.parse(request.query);
      if (schemas.params) schemas.params.parse(request.params);
      next();
    } catch (error) {
      next(error);
    }
  };
