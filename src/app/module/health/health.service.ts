import { prisma } from "../../lib/prisma.js";

export class HealthService {
  liveness() {
    return {
      status: "ok",
      service: "ph-healthcare-api",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness() {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ready",
      database: "available",
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
