import { addDays, addHours, isAfter, isBefore } from "date-fns";

export interface NoticeRules {
  minimumNoticeHours: number;
  maximumNoticeDays: number;
}

/**
 * Validates a requested booking window against the event type's rules.
 * Returns the user-facing error message, or null when the window is valid.
 * Shared by booking creation and reschedule so both enforce the same rules.
 */
export function validateBookingWindow(
  start: Date,
  end: Date,
  rules: NoticeRules,
  now: Date = new Date(),
): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid start or end time";
  }

  if (!isAfter(end, start)) {
    return "End time must be after start time";
  }

  if (isBefore(start, addHours(now, rules.minimumNoticeHours))) {
    return `Booking must be at least ${rules.minimumNoticeHours} hours in advance`;
  }

  if (isAfter(start, addDays(now, rules.maximumNoticeDays))) {
    return `Booking cannot be more than ${rules.maximumNoticeDays} days in advance`;
  }

  return null;
}

/** Prisma `where` fragment matching bookings that overlap [start, end). */
export function overlapsRange(start: Date, end: Date) {
  return { startTime: { lt: end }, endTime: { gt: start } };
}
