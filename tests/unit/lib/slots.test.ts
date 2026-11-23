import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots, getBookableDates } from "@/lib/slots";
import { buildBooking, buildEventType } from "../helpers/builders";

type Args = Parameters<typeof getAvailableSlots>;
type EventTypeArg = Args[1];
type BookingArg = Args[2][number];

function avail(dayOfWeek: number, startTime: string, endTime: string) {
  return {
    id: `a-${dayOfWeek}-${startTime}`,
    userId: "user-1",
    dayOfWeek,
    startTime,
    endTime,
  };
}

function makeEventType(
  availability: ReturnType<typeof avail>[],
  timezone = "UTC",
  overrides: Record<string, unknown> = {},
) {
  return {
    ...buildEventType(overrides),
    user: { availability, timezone },
  } as unknown as EventTypeArg;
}

function booking(start: string, end: string, status = "confirmed") {
  return buildBooking({
    startTime: new Date(start),
    endTime: new Date(end),
    status,
  }) as unknown as BookingArg;
}

const iso = (slots: { start: Date }[]) =>
  slots.map((s) => s.start.toISOString());

describe("getAvailableSlots", () => {
  // 2026-06-01 is a Monday
  const monday = new Date("2026-06-01T00:00:00Z");

  it("returns [] when there is no availability for that weekday", () => {
    const et = makeEventType([avail(2, "09:00", "10:00")]);
    expect(getAvailableSlots(monday, et, [])).toEqual([]);
  });

  it("generates back-to-back slots including the one ending at range end", () => {
    const et = makeEventType([avail(1, "09:00", "10:30")]);
    const slots = getAvailableSlots(monday, et, []);
    expect(iso(slots)).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T09:30:00.000Z",
      "2026-06-01T10:00:00.000Z",
    ]);
    expect(slots[2].end.toISOString()).toBe("2026-06-01T10:30:00.000Z");
  });

  it("does not emit a partial slot that overflows the range", () => {
    const et = makeEventType([avail(1, "09:00", "10:15")]);
    expect(iso(getAvailableSlots(monday, et, []))).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T09:30:00.000Z",
    ]);
  });

  it("handles multiple ranges on the same day", () => {
    const et = makeEventType([
      avail(1, "09:00", "10:00"),
      avail(1, "14:00", "15:00"),
    ]);
    expect(iso(getAvailableSlots(monday, et, []))).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T09:30:00.000Z",
      "2026-06-01T14:00:00.000Z",
      "2026-06-01T14:30:00.000Z",
    ]);
  });

  it("excludes slots overlapping a confirmed booking", () => {
    const et = makeEventType([avail(1, "09:00", "11:00")]);
    const slots = getAvailableSlots(monday, et, [
      booking("2026-06-01T09:30:00Z", "2026-06-01T10:00:00Z"),
    ]);
    expect(iso(slots)).toEqual([
      "2026-06-01T09:00:00.000Z",
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T10:30:00.000Z",
    ]);
  });

  it("a longer booking blocks every slot it covers", () => {
    const et = makeEventType([avail(1, "09:00", "11:00")]);
    const slots = getAvailableSlots(monday, et, [
      booking("2026-06-01T09:00:00Z", "2026-06-01T10:00:00Z"),
    ]);
    expect(iso(slots)).toEqual([
      "2026-06-01T10:00:00.000Z",
      "2026-06-01T10:30:00.000Z",
    ]);
  });

  it("ignores cancelled and declined bookings", () => {
    const et = makeEventType([avail(1, "09:00", "10:00")]);
    const slots = getAvailableSlots(monday, et, [
      booking("2026-06-01T09:00:00Z", "2026-06-01T09:30:00Z", "cancelled"),
      booking("2026-06-01T09:30:00Z", "2026-06-01T10:00:00Z", "declined"),
    ]);
    expect(slots).toHaveLength(2);
  });

  it("applies a non-UTC timezone (America/New_York, EDT)", () => {
    const et = makeEventType([avail(1, "09:00", "10:00")], "America/New_York");
    // Midnight UTC is still Sunday evening in New York, so pass midday UTC.
    const midday = new Date("2026-06-01T12:00:00Z");
    expect(iso(getAvailableSlots(midday, et, []))).toEqual([
      "2026-06-01T13:00:00.000Z",
      "2026-06-01T13:30:00.000Z",
    ]);
  });

  it("uses the weekday in the user's timezone, not UTC", () => {
    // 2026-06-02T02:00Z is still Monday 22:00 in New York
    const et = makeEventType([avail(1, "09:00", "09:30")], "America/New_York");
    const slots = getAvailableSlots(new Date("2026-06-02T02:00:00Z"), et, []);
    expect(iso(slots)).toEqual(["2026-06-01T13:00:00.000Z"]);
  });

  describe("DST transitions in America/New_York", () => {
    it("spring forward (2026-03-08): 09:00 local is EDT (13:00Z)", () => {
      // Sunday
      const et = makeEventType(
        [avail(0, "09:00", "11:00")],
        "America/New_York",
      );
      const slots = getAvailableSlots(new Date("2026-03-08T15:00:00Z"), et, []);
      expect(iso(slots)).toEqual([
        "2026-03-08T13:00:00.000Z",
        "2026-03-08T13:30:00.000Z",
        "2026-03-08T14:00:00.000Z",
        "2026-03-08T14:30:00.000Z",
      ]);
    });

    it("spring forward: a range spanning the jump is one real hour shorter", () => {
      // 01:00 EST (06:00Z) -> 04:00 EDT (08:00Z) = 2 real hours
      const et = makeEventType(
        [avail(0, "01:00", "04:00")],
        "America/New_York",
      );
      const slots = getAvailableSlots(new Date("2026-03-08T15:00:00Z"), et, []);
      expect(iso(slots)).toEqual([
        "2026-03-08T06:00:00.000Z",
        "2026-03-08T06:30:00.000Z",
        "2026-03-08T07:00:00.000Z",
        "2026-03-08T07:30:00.000Z",
      ]);
    });

    it("fall back (2026-11-01): 09:00 local is EST (14:00Z)", () => {
      const et = makeEventType(
        [avail(0, "09:00", "10:00")],
        "America/New_York",
      );
      const slots = getAvailableSlots(new Date("2026-11-01T15:00:00Z"), et, []);
      expect(iso(slots)).toEqual([
        "2026-11-01T14:00:00.000Z",
        "2026-11-01T14:30:00.000Z",
      ]);
    });

    it("fall back: a range spanning the repeated hour is one real hour longer", () => {
      // 00:00 EDT (04:00Z) -> 03:00 EST (08:00Z) = 4 real hours
      const et = makeEventType(
        [avail(0, "00:00", "03:00")],
        "America/New_York",
      );
      const slots = getAvailableSlots(new Date("2026-11-01T15:00:00Z"), et, []);
      expect(slots).toHaveLength(8);
      expect(slots[0].start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
      expect(slots[7].start.toISOString()).toBe("2026-11-01T07:30:00.000Z");
      expect(slots[7].end.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    });
  });
});

describe("getBookableDates", () => {
  // 2026-06-01 is a Monday; pin to UTC so startOfDay is UTC midnight.
  const NOW = new Date("2026-06-01T12:00:00Z");
  const weekdays = [1, 2, 3, 4, 5].map((d) => avail(d, "09:00", "10:00"));
  const dayIso = (dates: Date[]) =>
    dates.map((d) => d.toISOString().slice(0, 10));

  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("starts after the minimum notice window (24h -> tomorrow)", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 3,
    });
    expect(dayIso(getBookableDates(et, []))).toEqual([
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
  });

  it("stops at the maximum notice window", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 7,
    });
    const days = dayIso(getBookableDates(et, []));
    expect(days[days.length - 1]).toBe("2026-06-08");
    expect(days).not.toContain("2026-06-09");
  });

  it("skips weekdays without availability (weekend)", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 7,
    });
    const days = dayIso(getBookableDates(et, []));
    expect(days).not.toContain("2026-06-06");
    expect(days).not.toContain("2026-06-07");
  });

  it("excludes today when all of today's slots are already past", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 0,
      maximumNoticeDays: 1,
    });
    // 09:00-10:00 today is before NOW (12:00)
    expect(dayIso(getBookableDates(et, []))).toEqual(["2026-06-02"]);
  });

  it("excludes dates whose slots are all booked", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 2,
    });
    const bookings = [booking("2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z")];
    expect(dayIso(getBookableDates(et, bookings))).toEqual(["2026-06-03"]);
  });

  it("a cancelled booking does not remove the date", () => {
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 1,
    });
    const bookings = [
      booking("2026-06-02T09:00:00Z", "2026-06-02T10:00:00Z", "cancelled"),
    ];
    expect(dayIso(getBookableDates(et, bookings))).toEqual(["2026-06-02"]);
  });

  it("characterization: minimum notice is applied to the date, not to individual slots", () => {
    // 09:00 on 06-02 is only 21h after NOW, yet the date is still bookable.
    const et = makeEventType(weekdays, "UTC", {
      minimumNoticeHours: 24,
      maximumNoticeDays: 1,
    });
    expect(dayIso(getBookableDates(et, []))).toContain("2026-06-02");
    const slots = getAvailableSlots(new Date("2026-06-02T00:00:00Z"), et, []);
    expect(slots[0].start.getTime() - NOW.getTime()).toBeLessThan(
      24 * 3600 * 1000,
    );
  });
});
