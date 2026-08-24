import { createServer } from "node:http";

import app from "./app.js";
import { env } from "./app/config/env.js";
import { logger } from "./app/config/logger.js";
import { prisma } from "./app/lib/prisma.js";
import { cleanupExpiredAuthRecords } from "./app/module/auth/auth-cleanup.service.js";
import { cleanupDeletedPatientReportFiles } from "./app/module/medicalReport/medicalReport-cleanup.service.js";
import { processAppointmentLifecycle } from "./app/module/appointment/appointment-cleanup.service.js";
import { processPrescriptionReminders } from "./app/module/prescription/prescription-reminder.service.js";

const server = createServer(app);
let isShuttingDown = false;
const authCleanupInterval = setInterval(
  () => {
    void Promise.all([
      cleanupExpiredAuthRecords(),
      cleanupDeletedPatientReportFiles(),
      processPrescriptionReminders(),
    ]).catch((error: unknown) => {
      logger.error("Scheduled cleanup failed", { error });
    });
  },
  24 * 60 * 60 * 1_000,
);
authCleanupInterval.unref();
const appointmentLifecycleInterval = setInterval(
  () => {
    void processAppointmentLifecycle().catch((error: unknown) => {
      logger.error("Appointment lifecycle cleanup failed", { error });
    });
  },
  5 * 60 * 1_000,
);
appointmentLifecycleInterval.unref();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info("Graceful shutdown started", { signal });
  const forceShutdown = setTimeout(() => {
    logger.error("Graceful shutdown timed out", { signal });
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceShutdown.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
    clearInterval(authCleanupInterval);
    clearInterval(appointmentLifecycleInterval);
    clearTimeout(forceShutdown);
    logger.info("Graceful shutdown completed", { signal });
    process.exit(0);
  } catch (error) {
    logger.error("Graceful shutdown failed", { error, signal });
    process.exit(1);
  }
};

const bootstrap = async (): Promise<void> => {
  await prisma.$connect();
  await cleanupExpiredAuthRecords();
  await cleanupDeletedPatientReportFiles();
  await processAppointmentLifecycle();
  await processPrescriptionReminders();
  server.listen(env.PORT, env.HOST, () => {
    logger.info("Server started", {
      host: env.HOST,
      port: env.PORT,
      environment: env.NODE_ENV,
    });
  });
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", { error });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  void shutdown("SIGTERM");
});

bootstrap().catch((error: unknown) => {
  logger.error("Server initialization failed", { error });
  process.exit(1);
});
