// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEventType } from "../helpers/builders";
import { createPrismaMock } from "../helpers/prisma-mock";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {} as ReturnType<typeof createPrismaMock>,
}));

vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));

import { validateBooking } from "@/lib/booking-validation";

const NOW = new Date("2026-06-01T12:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3600 * 1000);

describe("validateBooking", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "UTC");
    Object.assign(prismaMock, createPrismaMock());
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.eventType.findUnique.mockResolvedValue(buildEventType());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns an eventType error when the event type does not exist", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue(null);
    const errors = await validateBooking("missing", hours(48));
    expect(errors).toEqual([
      { field: "eventType", message: "Event type not found" },
    ]);
    expect(prismaMock.booking.count).not.toHaveBeenCalled();
  });

  it("returns no errors for a valid start time", async () => {
    expect(await validateBooking("evt-type-1", hours(48))).toEqual([]);
  });

  it("rejects a start time inside the minimum notice window", async () => {
    const errors = await validateBooking("evt-type-1", hours(23));
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("startTime");
    expect(errors[0].message).toContain("at least 24 hours notice");
  });

  it("accepts a start time exactly at the minimum notice boundary", async () => {
    expect(await validateBooking("evt-type-1", hours(24))).toEqual([]);
  });

  it("rejects a start time beyond the maximum notice window", async () => {
    const errors = await validateBooking("evt-type-1", hours(14 * 24 + 1));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("up to 14 days in advance");
  });

  it("accepts a start time exactly at the maximum notice boundary", async () => {
    expect(await validateBooking("evt-type-1", hours(14 * 24))).toEqual([]);
  });

  it("does not query bookings when maxBookingsPerWeek is null", async () => {
    await validateBooking("evt-type-1", hours(48));
    expect(prismaMock.booking.count).not.toHaveBeenCalled();
  });

  describe("maxBookingsPerWeek", () => {
    beforeEach(() => {
      prismaMock.eventType.findUnique.mockResolvedValue(
        buildEventType({ maxBookingsPerWeek: 2 }),
      );
    });

    it("rejects when the weekly limit is reached", async () => {
      prismaMock.booking.count.mockResolvedValue(2);
      const errors = await validateBooking("evt-type-1", hours(48));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Maximum bookings per week (2)");
    });

    it("accepts when under the weekly limit", async () => {
      prismaMock.booking.count.mockResolvedValue(1);
      expect(await validateBooking("evt-type-1", hours(48))).toEqual([]);
    });

    it("characterization: counts only confirmed bookings (route uses not: cancelled)", async () => {
      prismaMock.booking.count.mockResolvedValue(0);
      await validateBooking("evt-type-1", hours(48));
      const where = prismaMock.booking.count.mock.calls[0][0].where;
      expect(where.eventTypeId).toBe("evt-type-1");
      expect(where.status).toEqual({ in: ["confirmed"] });
    });

    it("queries a 7-day window starting on the Sunday of the start week", async () => {
      prismaMock.booking.count.mockResolvedValue(0);
      // 2026-06-03 is a Wednesday; week starts Sunday 2026-05-31 (TZ=UTC)
      const start = new Date("2026-06-03T15:00:00Z");
      await validateBooking("evt-type-1", start);
      const { gte, lt } =
        prismaMock.booking.count.mock.calls[0][0].where.startTime;
      expect(gte.getDay()).toBe(0);
      expect(lt.getTime() - gte.getTime()).toBe(7 * 24 * 3600 * 1000);
      expect(gte.getTime()).toBeLessThanOrEqual(start.getTime());
      expect(lt.getTime()).toBeGreaterThan(start.getTime());
    });
  });

  it("collects notice and weekly-limit errors together", async () => {
    prismaMock.eventType.findUnique.mockResolvedValue(
      buildEventType({ maxBookingsPerWeek: 1 }),
    );
    prismaMock.booking.count.mockResolvedValue(1);
    const errors = await validateBooking("evt-type-1", hours(1));
    expect(errors).toHaveLength(2);
  });
});
