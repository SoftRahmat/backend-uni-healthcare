import { emailService, type EmailService } from "../../config/email.js";
import { env } from "../../config/env.js";
import { emailShell } from "../../templates/emailTemplates.js";

export class ReviewEmailService {
  constructor(private readonly transport: EmailService = emailService) {}
  async notifyCreated(input: {
    doctorEmail: string;
    rating: number;
    comment?: string | null;
    reviewId: string;
  }) {
    const body = `A verified patient submitted a ${input.rating}-star review.${input.comment ? ` Comment: ${input.comment}` : ""}`;
    await this.transport.send({
      to: input.doctorEmail,
      subject: "New patient review",
      ...emailShell(
        "New patient review",
        body,
        "View review",
        `${env.CLIENT_BASE_URL}/reviews/${input.reviewId}`,
      ),
    });
  }
  async notifyDeleted(input: {
    doctorEmail: string;
    patientEmail: string;
    adminDeleted: boolean;
    reason?: string;
  }) {
    const body = `A review was removed.${input.reason ? ` Reason: ${input.reason}.` : ""}`;
    await Promise.all([
      this.transport.send({
        to: input.doctorEmail,
        subject: "Review removed",
        ...emailShell("Review removed", body),
      }),
      ...(input.adminDeleted
        ? [
            this.transport.send({
              to: input.patientEmail,
              subject: "Your review was removed",
              ...emailShell("Review removed", body),
            }),
          ]
        : []),
    ]);
  }
  async notifyResponse(input: { patientEmail: string; response: string; reviewId: string }) {
    await this.transport.send({
      to: input.patientEmail,
      subject: "Doctor responded to your review",
      ...emailShell(
        "Doctor response",
        input.response,
        "View review",
        `${env.CLIENT_BASE_URL}/reviews/${input.reviewId}`,
      ),
    });
  }
}
export const reviewEmailService = new ReviewEmailService();
