import { emailService, type EmailService } from "../../config/email.js";
import { emailShell } from "../../templates/emailTemplates.js";

export class PrescriptionEmailService {
  constructor(private readonly transport: EmailService = emailService) {}
  async sendIssued(input: {
    patientEmail: string;
    doctorEmail: string;
    followUpDate?: Date | null;
    version: number;
    body: Buffer;
  }) {
    const message = `Prescription version ${input.version} is ready.${input.followUpDate ? ` Follow-up: ${input.followUpDate.toISOString().slice(0, 10)}.` : ""}`;
    const attachment = input.body.length
      ? [
          {
            filename: `prescription-v${input.version}.pdf`,
            content: input.body,
            contentType: "application/pdf",
          },
        ]
      : undefined;
    await Promise.all(
      [input.patientEmail, input.doctorEmail].map((to) =>
        this.transport.send({
          to,
          subject: `Prescription v${input.version}`,
          ...emailShell("Prescription ready", message),
          attachments: attachment,
        }),
      ),
    );
  }
  async sendReminder(input: { patientEmail: string; followUpDate: Date }) {
    const message = `Your prescription follow-up is scheduled for ${input.followUpDate.toISOString().slice(0, 10)}.`;
    await this.transport.send({
      to: input.patientEmail,
      subject: "Upcoming prescription follow-up",
      ...emailShell("Follow-up reminder", message),
    });
  }
}
export const prescriptionEmailService = new PrescriptionEmailService();
