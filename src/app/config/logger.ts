import winston from "winston";

// Shared structured logger configuration.

import { env } from "./env.js";

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    const suffix = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";
    return `${timestamp} ${level}: ${message}${suffix}`;
  }),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  silent: env.NODE_ENV === "test",
  format:
    env.NODE_ENV === "production"
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : developmentFormat,
  transports: [new winston.transports.Console()],
});
