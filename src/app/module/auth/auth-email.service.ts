import { emailService, type EmailService } from "../../config/email.js";
import { env } from "../../config/env.js";
import { emailShell } from "../../templates/emailTemplates.js";

export class AuthEmailService {
  constructor(private readonly transport: EmailService = emailService) {}

  async sendVerification(email: string, token: string): Promise<void> {
    const url = `${env.CLIENT_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
    await this.transport.send({
      to: email,
      subject: "Verify your PH-HealthCare email",
      ...emailShell(
        "Verify your email",
        "This link expires in 24 hours and can only be used once.",
        "Verify email",
        url,
      ),
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = `${env.CLIENT_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.transport.send({
      to: email,
      subject: "Reset your PH-HealthCare password",
      ...emailShell(
        "Reset your password",
        "This link expires in one hour and can only be used once.",
        "Reset password",
        url,
      ),
    });
  }

  async sendPasswordChanged(email: string): Promise<void> {
    await this.transport.send({
      to: email,
      subject: "Your PH-HealthCare password was changed",
      ...emailShell("Password changed", "Your account password has been changed successfully."),
    });
  }
}
