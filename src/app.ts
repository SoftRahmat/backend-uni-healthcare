import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";

import { env } from "./app/config/env.js";
import { ApiError } from "./app/errorHelpers/ApiError.js";
import { errorHandler } from "./app/middleware/error.middleware.js";
import { notFoundHandler } from "./app/middleware/notFound.middleware.js";
import { apiRateLimiter } from "./app/middleware/rateLimit.middleware.js";
import { requestId } from "./app/middleware/requestId.middleware.js";
import { requestLogger } from "./app/middleware/requestLogger.middleware.js";
import { healthRouter } from "./app/module/health/health.routes.js";
import { apiRouter } from "./app/routes/index.js";
import { successResponse } from "./app/utils/ApiResponse.js";

const createCorsMiddleware = () => {
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  return cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has("*") || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new ApiError(403, "Origin is not allowed", "CORS_ORIGIN_DENIED"));
    },
  });
};

export const createApp = (): Application => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.REQUEST_BODY_LIMIT }));

  app.get("/", (_request, response) => {
    response.status(200).json(
      successResponse("Welcome to the PH-HealthCare API", {
        service: "ph-healthcare-api",
        version: "1.0.0",
        apiBaseUrl: "/api/v1",
        healthUrl: "/health",
      }),
    );
  });

  app.use("/health", healthRouter);
  app.use("/api/v1", apiRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const app = createApp();

export default app;
