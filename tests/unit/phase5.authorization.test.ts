import { describe, expect, it } from "vitest";

import { ScheduleService } from "../../src/app/module/schedule/schedule.service.js";
import { addIsoDays, todayInScheduleTimeZone } from "../../src/app/module/schedule/schedule.validation.js";

const tomorrow = addIsoDays(todayInScheduleTimeZone(), 1);
const slot = { scheduleDate: tomorrow, startTime: "09:00", endTime: "10:00" };

describe("Phase 5 service authorization", () => {
  const service = new ScheduleService();

  it("blocks patients from schedule management before persistence", async () => {
    await expect(service.create({ schedules: [slot] }, {
      userId: "patient-user", role: "PATIENT", profileId: "patient-id",
    }, {})).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(service.update("schedule-id", {}, {
      userId: "patient-user", role: "PATIENT",
    }, {})).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("prevents doctors from managing another doctor's schedule", async () => {
    await expect(service.create({ doctorId: "other-doctor", schedules: [slot] }, {
      userId: "doctor-user", role: "DOCTOR", profileId: "own-doctor",
    }, {})).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("does not expose booked slots publicly or across doctors", async () => {
    const query = { doctorId: "doctor-a", startDate: tomorrow, endDate: tomorrow, showBooked: true };
    await expect(service.list(query)).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(service.list(query, {
      userId: "doctor-b-user", role: "DOCTOR", profileId: "doctor-b",
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("rejects overlapping bulk slots before persistence", async () => {
    await expect(service.create({ doctorId: "doctor-a", schedules: [
      slot,
      { scheduleDate: tomorrow, startTime: "09:30", endTime: "11:00" },
    ] }, { userId: "admin-user", role: "ADMIN" }, {}))
      .rejects.toMatchObject({ statusCode: 409, code: "SCHEDULE_OVERLAP" });
  });
});
