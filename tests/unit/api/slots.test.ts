// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking, buildEventType, buildUser } from "../helpers/builders";
import { useTestEnv } from "../helpers/env";
import type { PrismaMock } from "../helpers/prisma-mock";
import { getRequest } from "../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/slots", () => ({ getAvailableSlots: vi.fn() }));

import { GET } from "@/app/api/slots/route";
import { prisma } from "@/lib/prisma.server";
import { getAvailableSlots } from "@/lib/slots";

const db = prisma as unknown as PrismaMock;
const slotsMock = vi.mocked(getAvailableSlots);
const url = (q: string) => `https://app.test/api/slots?${q}`;
const slot = (start: string, end: string) => ({
  start: new Date(start),
  end: new Date(end),
});

function mockEventType(overrides: Record<string, unknown> = {}, tz = "UTC") {
  db.eventType.findUnique.mockResolvedValue({
    ...buildEventType(overrides),
    user: { ...buildUser({ timezone: tz }), availability: [] },
  });
}

describe("GET /api/slots", () => {
  useTestEnv();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.booking.findMany.mockResolvedValue([]);
    db.booking.count.mockResolvedValue(0);
    slotsMock.mockReturnValue([]);
  });

  it("returns 400 when eventTypeId or date is missing", async () => {
    expect((await GET(getRequest(url("date=2026-03-04")))).status).toBe(400);
    expect((await GET(getRequest(url("eventTypeId=e")))).status).toBe(400);
  });

  it("returns 404 when the event type does not exist", async () => {
    db.eventType.findUnique.mockResolvedValue(null);
    const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
    expect(res.status).toBe(404);
  });

  it("returns slots as ISO strings", async () => {
    mockEventType();
    slotsMock.mockReturnValue([
      slot("2026-03-04T10:00:00Z", "2026-03-04T10:30:00Z"),
    ]);
    const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slots: [
        { start: "2026-03-04T10:00:00.000Z", end: "2026-03-04T10:30:00.000Z" },
      ],
    });
  });

  it("passes host-timezone day bounds and existing bookings through", async () => {
    mockEventType({}, "America/New_York");
    const existing = [buildBooking()];
    db.booking.findMany.mockResolvedValue(existing);
    await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
    // Midnight in New York (EST, UTC-5)
    expect(slotsMock.mock.calls[0][0]).toEqual(
      new Date("2026-03-04T05:00:00Z"),
    );
    expect(slotsMock.mock.calls[0][2]).toBe(existing);
    const { where } = db.booking.findMany.mock.calls[0][0];
    expect(where.startTime).toEqual({
      gte: new Date("2026-03-04T05:00:00Z"),
      lt: new Date("2026-03-05T05:00:00Z"),
    });
    expect(where.status).toEqual({ not: "cancelled" });
  });

  it("filters out slots inside the minimum notice window", async () => {
    mockEventType({ minimumNoticeHours: 24 });
    slotsMock.mockReturnValue([
      slot("2026-03-01T23:00:00Z", "2026-03-01T23:30:00Z"), // < 24h
      slot("2026-03-02T00:00:00Z", "2026-03-02T00:30:00Z"), // exactly 24h: excluded
      slot("2026-03-02T00:30:00Z", "2026-03-02T01:00:00Z"),
    ]);
    const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-02")));
    const body = await res.json();
    expect(body.slots).toEqual([
      { start: "2026-03-02T00:30:00.000Z", end: "2026-03-02T01:00:00.000Z" },
    ]);
  });

  describe("weekly cap", () => {
    it("returns no slots when the week is full", async () => {
      mockEventType({ maxBookingsPerWeek: 2 });
      db.booking.count.mockResolvedValue(2);
      const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
      expect(await res.json()).toEqual({ slots: [] });
      expect(slotsMock).not.toHaveBeenCalled();
      const { where } = db.booking.count.mock.calls[0][0];
      // Sunday-based UTC week containing Wed 2026-03-04
      expect(where.startTime).toEqual({
        gte: new Date("2026-03-01T00:00:00Z"),
        lt: new Date("2026-03-08T00:00:00Z"),
      });
      expect(where.status).toEqual({ not: "cancelled" });
      expect(where.id).toBeUndefined();
    });

    it("computes slots when the week is below the cap", async () => {
      mockEventType({ maxBookingsPerWeek: 2 });
      db.booking.count.mockResolvedValue(1);
      slotsMock.mockReturnValue([
        slot("2026-03-04T10:00:00Z", "2026-03-04T10:30:00Z"),
      ]);
      const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
      expect((await res.json()).slots).toHaveLength(1);
    });

    it("excludes the booking being rescheduled from the count", async () => {
      mockEventType({ maxBookingsPerWeek: 1 });
      await GET(getRequest(url("eventTypeId=e&date=2026-03-04&bookingId=b-9")));
      const { where } = db.booking.count.mock.calls[0][0];
      expect(where.id).toEqual({ not: "b-9" });
    });

    it("does not count bookings when there is no cap", async () => {
      mockEventType({ maxBookingsPerWeek: null });
      await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
      expect(db.booking.count).not.toHaveBeenCalled();
    });
  });

  it("returns 500 when the database throws", async () => {
    db.eventType.findUnique.mockRejectedValue(new Error("db"));
    const res = await GET(getRequest(url("eventTypeId=e&date=2026-03-04")));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(console.error).toHaveBeenCalled();
  });
});
