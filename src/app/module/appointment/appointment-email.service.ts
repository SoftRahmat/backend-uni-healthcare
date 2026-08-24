import { emailService, type EmailService } from "../../config/email.js";
import { emailShell } from "../../templates/emailTemplates.js";

export class AppointmentEmailService {
  constructor(private readonly transport: EmailService = emailService) {}

  async sendBooked(input: { patientEmail: string; doctorEmail: string; date: string; time: string; paymentLink: string }) {
    const message = `Appointment scheduled for ${input.date} at ${input.time}. Payment: ${input.paymentLink}`;
    await Promise.all([
      this.transport.send({ to: input.patientEmail, subject: "Appointment booked", ...emailShell("Appointment booked", message) }),
      this.transport.send({ to: input.doctorEmail, subject: "New appointment", ...emailShell("New appointment", message) }),
    ]);
  }

  async sendCancelled(input: { patientEmail: string; doctorEmail: string; reason?: string; refundAmount: number }) {
    const message = `Appointment cancelled.${input.reason ? ` Reason: ${input.reason}.` : ""} Refund amount: ${input.refundAmount}.`;
    await Promise.all([
      this.transport.send({ to: input.patientEmail, subject: "Appointment cancelled", ...emailShell("Appointment cancelled", message) }),
      this.transport.send({ to: input.doctorEmail, subject: "Appointment cancelled", ...emailShell("Appointment cancelled", message) }),
    ]);
  }
}
