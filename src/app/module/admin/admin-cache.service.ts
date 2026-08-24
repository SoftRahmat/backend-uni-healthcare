import { logger } from "../../config/logger.js";

export interface CacheInvalidationService {
  invalidateAdmin(adminId: string, userId: string): Promise<void>;
}

export class LoggingCacheInvalidationService implements CacheInvalidationService {
  async invalidateAdmin(adminId: string, userId: string): Promise<void> {
    logger.debug("Admin and user cache invalidated", {
      keys: [`admin:${adminId}`, `user:${userId}`, "admins:list:*"],
    });
  }
}

export const cacheInvalidationService = new LoggingCacheInvalidationService();
