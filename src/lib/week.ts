import { fromZonedTime, toZonedTime } from "date-fns-tz";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Same wall-clock time `days` days later (or earlier) in `timeZone`, as an
 * instant. DST-safe: a "day" is a calendar day, not 24 hours.
 */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const zoned = toZonedTime(date, timeZone);
  const shifted = new Date(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate() + days),
  );
  return fromZonedTime(
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
      shifted.getUTCDate(),
    )}T${pad(zoned.getHours())}:${pad(zoned.getMinutes())}:${pad(
      zoned.getSeconds(),
    )}`,
    timeZone,
  );
}

/**
 * The booking week containing `date`, in the host's timezone: Sunday 00:00
 * (inclusive) to the next Sunday 00:00 (exclusive). Used by every weekly-cap
 * check so they all agree on where a week starts, regardless of the server's
 * own timezone.
 */
export function getWeekRange(
  date: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const zoned = toZonedTime(date, timeZone);
  const midnight = fromZonedTime(
    `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(
      zoned.getDate(),
    )}T00:00:00`,
    timeZone,
  );
  const start = addZonedDays(midnight, -zoned.getDay(), timeZone);
  const end = addZonedDays(start, 7, timeZone);
  return { start, end };
}
