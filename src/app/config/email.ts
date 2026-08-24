import { env } from "./env.js";

// Shared email transport boundary used by domain modules.
import { logger } from "./logger.js";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

export class LoggingEmailService implements EmailService {
  async send(message: EmailMessage): Promise<void> {
    logger.info("Authentication email queued", {
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
    });
  }
}

export const emailService: EmailService = new LoggingEmailService();
