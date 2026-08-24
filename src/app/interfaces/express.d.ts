export {};

// Express request extensions shared by all application modules.

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      rawBody?: Buffer;
      auth?: {
        userId: string;
        sessionId: string;
        email: string;
        role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "PATIENT";
        profileId?: string;
      };
    }
  }
}
