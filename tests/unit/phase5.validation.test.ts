import { describe, expect, it } from "vitest";

import {
  addIsoDays,
  createScheduleSchema,
  dateInTimeZone,
  scheduleListQuerySchema,
  slotsOverlap,
  todayInScheduleTimeZone,
  updateScheduleSchema,
} from "../../src/app/module/schedule/schedule.validation.js";

const today = todayInScheduleTimeZone();
const tomorrow = addIsoDays(today, 1);

describe("Phase 5 schedule contracts", () => {
  it("normalizes single and bulk creation payloads", () => {
    const single = createScheduleSchema.parse({
      scheduleDate: tomorrow,
      startTime: "09:00",
      endTime: "10:00",
    });
    const bulk = createScheduleSchema.parse({
      doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      schedules: [
        { scheduleDate: tomorrow, startTime: "09:00", endTime: "10:00" },
        { scheduleDate: tomorrow, startTime: "10:00", endTime: "11:00" },
      ],
    });
    expect(single.schedules).toHaveLength(1);
    expect(bulk.schedules).toHaveLength(2);
  });

  it.each([
    { scheduleDate: addIsoDays(today, -1), startTime: "09:00", endTime: "10:00" },
    { scheduleDate: tomorrow, startTime: "9:00", endTime: "10:00" },
    { scheduleDate: tomorrow, startTime: "10:00", endTime: "09:00" },
    { scheduleDate: tomorrow, startTime: "09:00", endTime: "09:29" },
    { scheduleDate: tomorrow, startTime: "00:00", endTime: "12:01" },
  ])("rejects invalid schedule timing: %o", (slot) => {
    expect(createScheduleSchema.safeParse(slot).success).toBe(false);
  });

  it("rejects overlaps inside a bulk request while allowing adjacent slots", () => {
    expect(createScheduleSchema.safeParse({ schedules: [
      { scheduleDate: tomorrow, startTime: "09:00", endTime: "10:00" },
      { scheduleDate: tomorrow, startTime: "09:30", endTime: "11:00" },
    ] }).success).toBe(false);
    expect(slotsOverlap(
      { scheduleDate: tomorrow, startTime: "09:00", endTime: "10:00" },
      { scheduleDate: tomorrow, startTime: "10:00", endTime: "11:00" },
    )).toBe(false);
  });

  it("defaults public lookup to seven days and validates booked visibility input", () => {
    const query = scheduleListQuerySchema.parse({ doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" });
    expect(query.startDate).toBe(today);
    expect(query.endDate).toBe(addIsoDays(today, 7));
    expect(query.showBooked).toBe(false);
    expect(scheduleListQuerySchema.safeParse({
      doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      showBooked: "invalid",
    }).success).toBe(false);
    expect(scheduleListQuerySchema.safeParse({
      doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      startDate: tomorrow,
      endDate: today,
    }).success).toBe(false);
    expect(scheduleListQuerySchema.safeParse({
      doctorId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      date: today,
      startDate: today,
    }).success).toBe(false);
  });

  it("supports partial updates and validates complete time pairs", () => {
    expect(updateScheduleSchema.safeParse({ startTime: "10:00" }).success).toBe(true);
    expect(updateScheduleSchema.safeParse({ startTime: "10:00", endTime: "09:00" }).success).toBe(false);
    expect(updateScheduleSchema.safeParse({}).success).toBe(false);
  });

  it("uses IANA timezones when determining a schedule date", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z");
    expect(dateInTimeZone(instant, "America/Los_Angeles")).toBe("2025-12-31");
    expect(dateInTimeZone(instant, "Asia/Singapore")).toBe("2026-01-01");
  });
});
