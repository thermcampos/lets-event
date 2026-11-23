import { afterEach, describe, expect, it } from "vitest";
import { addZonedDays, getWeekRange } from "@/lib/week";

const iso = (range: { start: Date; end: Date }) => [
  range.start.toISOString(),
  range.end.toISOString(),
];

describe("getWeekRange", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("returns Sunday 00:00 to next Sunday 00:00 for a UTC host", () => {
    // Tuesday 2026-03-10
    expect(iso(getWeekRange(new Date("2026-03-10T15:30:00Z"), "UTC"))).toEqual([
      "2026-03-08T00:00:00.000Z",
      "2026-03-15T00:00:00.000Z",
    ]);
  });

  it("a Sunday belongs to the week it starts", () => {
    expect(iso(getWeekRange(new Date("2026-03-08T00:00:00Z"), "UTC"))).toEqual([
      "2026-03-08T00:00:00.000Z",
      "2026-03-15T00:00:00.000Z",
    ]);
  });

  it("the last millisecond of Saturday belongs to the previous week", () => {
    expect(
      iso(getWeekRange(new Date("2026-03-14T23:59:59.999Z"), "UTC")),
    ).toEqual(["2026-03-08T00:00:00.000Z", "2026-03-15T00:00:00.000Z"]);
  });

  it("uses the host's wall clock for the boundary (positive offset)", () => {
    // 2026-03-08T20:00Z is Sunday in UTC but Monday 09:00 in Auckland (NZDT, +13).
    expect(
      iso(getWeekRange(new Date("2026-03-08T20:00:00Z"), "Pacific/Auckland")),
    ).toEqual(["2026-03-07T11:00:00.000Z", "2026-03-14T11:00:00.000Z"]);
  });

  it("uses the host's wall clock for the boundary (negative offset)", () => {
    // 2026-03-08T03:00Z is still Saturday 19:00 in Los Angeles (PST, -8).
    expect(
      iso(
        getWeekRange(new Date("2026-03-08T03:00:00Z"), "America/Los_Angeles"),
      ),
    ).toEqual(["2026-03-01T08:00:00.000Z", "2026-03-08T08:00:00.000Z"]);
  });

  it("instants either side of host-local Sunday midnight land in different weeks", () => {
    const midnight = new Date("2026-03-15T04:00:00Z"); // Sun 00:00 EDT, New York
    const after = getWeekRange(midnight, "America/New_York");
    const before = getWeekRange(
      new Date(midnight.getTime() - 1),
      "America/New_York",
    );
    expect(after.start.toISOString()).toBe("2026-03-15T04:00:00.000Z");
    expect(before.end.toISOString()).toBe("2026-03-15T04:00:00.000Z");
    expect(before.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("spring-forward week is 167 hours long", () => {
    const range = getWeekRange(
      new Date("2026-03-10T12:00:00Z"),
      "America/New_York",
    );
    expect(iso(range)).toEqual([
      "2026-03-08T05:00:00.000Z", // Sun 00:00 EST
      "2026-03-15T04:00:00.000Z", // Sun 00:00 EDT
    ]);
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(167);
  });

  it("fall-back week is 169 hours long", () => {
    const range = getWeekRange(
      new Date("2026-11-04T12:00:00Z"),
      "America/New_York",
    );
    expect(iso(range)).toEqual([
      "2026-11-01T04:00:00.000Z", // Sun 00:00 EDT
      "2026-11-08T05:00:00.000Z", // Sun 00:00 EST
    ]);
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(169);
  });

  it("does not depend on the server's own timezone", () => {
    const date = new Date("2026-03-08T20:00:00Z");
    const results = ["UTC", "Asia/Tokyo", "America/Los_Angeles"].map((tz) => {
      process.env.TZ = tz;
      return iso(getWeekRange(date, "Pacific/Auckland"));
    });
    for (const r of results) {
      expect(r).toEqual([
        "2026-03-07T11:00:00.000Z",
        "2026-03-14T11:00:00.000Z",
      ]);
    }
  });
});

describe("addZonedDays", () => {
  it("keeps the wall-clock time across a DST change", () => {
    // Sat 2026-03-07 00:00 EST -> Mon 2026-03-09 00:00 EDT (clocks sprang forward)
    const sat = new Date("2026-03-07T05:00:00Z");
    expect(addZonedDays(sat, 1, "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(addZonedDays(sat, 2, "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  it("supports negative offsets and month boundaries", () => {
    expect(
      addZonedDays(new Date("2026-03-01T00:00:00Z"), -1, "UTC").toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z");
  });

  it("adding zero days returns the same instant", () => {
    const d = new Date("2026-06-15T13:45:10Z");
    expect(addZonedDays(d, 0, "Europe/Berlin").toISOString()).toBe(
      "2026-06-15T13:45:10.000Z",
    );
  });
});
