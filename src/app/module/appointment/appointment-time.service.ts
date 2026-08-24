import { env } from "../../config/env.js";

type ScheduleTime = { scheduleDate: Date | string; startTime: string; endTime: string };

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
    hour: number("hour"),
    minute: number("minute"),
    second: number("second"),
  };
};

export const zonedScheduleInstant = (
  scheduleDate: Date | string,
  time: string,
  timeZone = env.SCHEDULE_TIME_ZONE,
): Date => {
  const date =
    typeof scheduleDate === "string" ? scheduleDate : scheduleDate.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  let instant = new Date(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = zonedParts(instant, timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    instant = new Date(instant.getTime() + target - representedUtc);
  }
  const final = zonedParts(instant, timeZone);
  if (
    final.year !== year ||
    final.month !== month ||
    final.day !== day ||
    final.hour !== hour ||
    final.minute !== minute
  ) {
    throw new Error("Schedule time does not exist in the configured timezone");
  }
  return instant;
};

export const appointmentWindow = (schedule: ScheduleTime) => ({
  startsAt: zonedScheduleInstant(schedule.scheduleDate, schedule.startTime),
  endsAt: zonedScheduleInstant(schedule.scheduleDate, schedule.endTime),
});

export const hoursUntil = (instant: Date, now = new Date()): number =>
  (instant.getTime() - now.getTime()) / (60 * 60 * 1_000);
