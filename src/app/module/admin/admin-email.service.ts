import { emailService, type EmailService } from "../../config/email.js";
import { env } from "../../config/env.js";
import { adminWelcomeTemplate } from "../../templates/emailTemplates.js";

export class AdminEmailService {
  constructor(private readonly transport: EmailService = emailService) {}

  async sendAdminWelcome(email: string, temporaryPassword: string): Promise<void> {
    const url = `${env.CLIENT_BASE_URL}/login`;
    await this.transport.send({
      to: email,
      subject: "Welcome to PH-HealthCare administration",
      ...adminWelcomeTemplate(temporaryPassword, url),
    });
  }
}
