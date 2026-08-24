import { z } from "zod";

import { env } from "../../config/env.js";

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ScheduleSlot = { scheduleDate: string; startTime: string; endTime: string };

export const dateInTimeZone = (date: Date, timeZone = env.SCHEDULE_TIME_ZONE): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const todayInScheduleTimeZone = (): string => dateInTimeZone(new Date());

export const addIsoDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isRealIsoDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const timeMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export const slotDurationMinutes = (slot: Pick<ScheduleSlot, "startTime" | "endTime">): number =>
  timeMinutes(slot.endTime) - timeMinutes(slot.startTime);

export const slotsOverlap = (left: ScheduleSlot, right: ScheduleSlot): boolean =>
  left.scheduleDate === right.scheduleDate &&
  left.startTime < right.endTime &&
  right.startTime < left.endTime;

const isoDateSchema = z
  .string()
  .regex(DATE_PATTERN, "Date must use YYYY-MM-DD")
  .refine(isRealIsoDate, "Date is invalid");
const futureOrTodayDateSchema = isoDateSchema.refine(
  (value) => value >= todayInScheduleTimeZone(),
  "Schedule date must be today or in the future",
);
const timeSchema = z.string().regex(TIME_PATTERN, "Time must use 24-hour HH:mm format");

const addTimingIssues = (
  slot: Pick<ScheduleSlot, "startTime" | "endTime">,
  context: z.RefinementCtx,
) => {
  const duration = slotDurationMinutes(slot);
  if (duration <= 0) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "End time must be after start time",
    });
  } else if (duration < 30 || duration > 12 * 60) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "Schedule duration must be between 30 minutes and 12 hours",
    });
  }
};

export const scheduleSlotSchema = z
  .object({
    scheduleDate: futureOrTodayDateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .strict()
  .superRefine(addTimingIssues);

const doctorId = z.uuid().optional();
const singleScheduleSchema = scheduleSlotSchema
  .safeExtend({ doctorId })
  .transform(({ doctorId: id, ...slot }) => ({
    doctorId: id,
    schedules: [slot],
  }));
const bulkScheduleSchema = z
  .object({
    doctorId,
    schedules: z.array(scheduleSlotSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    for (let left = 0; left < value.schedules.length; left += 1) {
      for (let right = left + 1; right < value.schedules.length; right += 1) {
        if (slotsOverlap(value.schedules[left]!, value.schedules[right]!)) {
          context.addIssue({
            code: "custom",
            path: ["schedules", right],
            message: "Bulk schedules cannot overlap",
          });
        }
      }
    }
  });

export const createScheduleSchema = z.union([singleScheduleSchema, bulkScheduleSchema]);

export const updateScheduleSchema = z
  .object({
    scheduleDate: futureOrTodayDateSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one update is required")
  .superRefine((value, context) => {
    if (value.startTime && value.endTime) addTimingIssues(value as ScheduleSlot, context);
  });

const strictBooleanQuery = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const scheduleListQuerySchema = z
  .object({
    doctorId: z.uuid(),
    date: isoDateSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    showBooked: strictBooleanQuery.default(false),
  })
  .strict()
  .refine((value) => !value.date || (!value.startDate && !value.endDate), {
    message: "Use either a specific date or a date range",
  })
  .transform((value) => {
    const today = todayInScheduleTimeZone();
    const startDate = value.date ?? value.startDate ?? today;
    const endDate = value.date ?? value.endDate ?? addIsoDays(startDate, 7);
    return { doctorId: value.doctorId, startDate, endDate, showBooked: value.showBooked };
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "Start date cannot be after end date",
  });

export const scheduleIdParamsSchema = z.object({ scheduleId: z.uuid() });

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ScheduleListQuery = z.infer<typeof scheduleListQuerySchema>;
