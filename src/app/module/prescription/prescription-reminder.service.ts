import { prisma } from "../../lib/prisma.js";
import { prescriptionEmailService } from "./prescription-email.service.js";

export const processPrescriptionReminders = async (now = new Date()): Promise<number> => {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
  const end = new Date(target.getTime() + 86_400_000);
  const due = await prisma.prescription.findMany({
    where: { followUpDate: { gte: target, lt: end }, reminderSentAt: null },
    include: { patient: true },
  });
  let sent = 0;
  for (const item of due) {
    await prescriptionEmailService.sendReminder({
      patientEmail: item.patient.email,
      followUpDate: item.followUpDate!,
    });
    await prisma.$transaction([
      prisma.prescription.updateMany({
        where: { id: item.id, reminderSentAt: null },
        data: { reminderSentAt: now },
      }),
      prisma.auditLog.create({
        data: {
          action: "PRESCRIPTION_REMINDER_SENT",
          metadata: { prescriptionId: item.id, followUpDate: item.followUpDate!.toISOString() },
        },
      }),
    ]);
    sent += 1;
  }
  return sent;
};
