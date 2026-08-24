import { randomUUID } from "node:crypto";

import { SignJWT } from "jose";

import { env } from "../../config/env.js";
import type { ApplicationRole } from "../../shared/constants/roles.js";
import { appointmentWindow } from "./appointment-time.service.js";

const videoSecret = new TextEncoder().encode(env.JWT_SECRET);

export class AppointmentVideoService {
  createMeetingId(): string {
    return randomUUID();
  }

  async accessLink(
    appointment: {
      id: string;
      status?: string;
      videoCallingId: string;
      schedule: { scheduleDate: Date; startTime: string; endTime: string };
    },
    actor: { userId: string; role: ApplicationRole },
    now = new Date(),
  ): Promise<string | null> {
    if (appointment.status === "CANCELLED") return null;
    const { startsAt, endsAt } = appointmentWindow(appointment.schedule);
    if (now.getTime() < startsAt.getTime() - 15 * 60 * 1_000) return null;
    const expiresAt = new Date(endsAt.getTime() + 60 * 60 * 1_000);
    if (now >= expiresAt) return null;
    const token = await new SignJWT({
      appointmentId: appointment.id,
      meetingId: appointment.videoCallingId,
      role: actor.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(actor.userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(videoSecret);
    return `${env.CLIENT_BASE_URL}/video/${appointment.videoCallingId}?token=${encodeURIComponent(token)}`;
  }
}
