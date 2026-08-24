import { emailService, type EmailService } from "../../config/email.js";
import { env } from "../../config/env.js";
import { emailShell } from "../../templates/emailTemplates.js";

export class DoctorEmailService {
  constructor(private readonly transport: EmailService = emailService) {}

  async sendWelcome(email: string, temporaryPassword: string): Promise<void> {
    await this.transport.send({
      to: email,
      subject: "Welcome to the PH-HealthCare doctor portal",
      ...emailShell(
        "Your doctor account is ready",
        `Your temporary password is ${temporaryPassword}. Change it after signing in.`,
        "Sign in to the doctor portal",
        `${env.CLIENT_BASE_URL}/doctor/login`,
      ),
    });
  }

  async sendDeactivation(email: string, reason?: string): Promise<void> {
    await this.transport.send({
      to: email,
      subject: "PH-HealthCare doctor account deactivated",
      ...emailShell(
        "Doctor account deactivated",
        reason ? `Your account was deactivated. Reason: ${reason}` : "Your account was deactivated. Contact support for assistance.",
      ),
    });
  }
}
