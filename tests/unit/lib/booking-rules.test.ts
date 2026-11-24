import { describe, expect, it } from "vitest";
import {
  ACTIVE_BOOKING_STATUS,
  overlapsRange,
  validateBookingWindow,
} from "@/lib/booking-rules";

const NOW = new Date("2026-03-02T09:00:00Z");
const HOUR = 3_600_000;
const rules = { minimumNoticeHours: 24, maximumNoticeDays: 14 };
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const validate = (start: Date, end: Date) =>
  validateBookingWindow(start, end, rules, NOW);

describe("validateBookingWindow", () => {
  it("returns null for a valid window", () => {
    expect(validate(at(48 * HOUR), at(48.5 * HOUR))).toBeNull();
  });

  it("rejects invalid dates", () => {
    expect(validate(new Date("nope"), at(48 * HOUR))).toBe(
      "Invalid start or end time",
    );
    expect(validate(at(48 * HOUR), new Date("nope"))).toBe(
      "Invalid start or end time",
    );
  });

  it("rejects an end that is not after the start", () => {
    expect(validate(at(48 * HOUR), at(48 * HOUR))).toBe(
      "End time must be after start time",
    );
    expect(validate(at(48 * HOUR), at(47 * HOUR))).toBe(
      "End time must be after start time",
    );
  });

  it("minimum notice is inclusive at the boundary", () => {
    expect(validate(at(24 * HOUR), at(25 * HOUR))).toBeNull();
    expect(validate(at(24 * HOUR - 1), at(25 * HOUR))).toBe(
      "Booking must be at least 24 hours in advance",
    );
  });

  it("maximum notice is inclusive at the boundary", () => {
    const max = 14 * 24 * HOUR;
    expect(validate(at(max), at(max + HOUR))).toBeNull();
    expect(validate(at(max + 1), at(max + HOUR))).toBe(
      "Booking cannot be more than 14 days in advance",
    );
  });

  it("reports ordering before notice problems", () => {
    // in the past AND end before start -> ordering error wins
    expect(validate(at(-HOUR), at(-2 * HOUR))).toBe(
      "End time must be after start time",
    );
  });

  it("uses the real clock when `now` is omitted", () => {
    const start = new Date(Date.now() + 48 * HOUR);
    expect(
      validateBookingWindow(start, new Date(start.getTime() + HOUR), rules),
    ).toBeNull();
  });
});

describe("overlapsRange", () => {
  it("matches bookings that start before the range ends and end after it starts", () => {
    const start = new Date("2026-03-10T10:00:00Z");
    const end = new Date("2026-03-10T10:30:00Z");
    expect(overlapsRange(start, end)).toEqual({
      startTime: { lt: end },
      endTime: { gt: start },
    });
  });
});

describe("ACTIVE_BOOKING_STATUS", () => {
  it("releases cancelled and declined bookings but keeps confirmed and proposed", () => {
    expect(ACTIVE_BOOKING_STATUS.notIn).toEqual(["cancelled", "declined"]);
    expect(ACTIVE_BOOKING_STATUS.notIn).not.toContain("confirmed");
    expect(ACTIVE_BOOKING_STATUS.notIn).not.toContain("proposed");
  });
});
