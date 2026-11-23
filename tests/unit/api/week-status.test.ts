// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEventType } from "../helpers/builders";
import { useTestEnv } from "../helpers/env";
import type { PrismaMock } from "../helpers/prisma-mock";
import { getRequest } from "../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});

import { GET } from "@/app/api/bookings/week-status/route";
import { prisma } from "@/lib/prisma.server";

const db = prisma as unknown as PrismaMock;
const url = (q = "eventTypeId=evt-type-1") =>
  `https://app.test/api/bookings/week-status?${q}`;

describe("GET /api/bookings/week-status", () => {
  useTestEnv();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Wednesday; with TZ=UTC the first week starts Sunday 2026-03-01.
    vi.setSystemTime(new Date("2026-03-04T12:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 400 without eventTypeId", async () => {
    const res = await GET(getRequest(url("")));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing eventTypeId" });
  });

  it("returns 404 when the event type does not exist", async () => {
    db.eventType.findUnique.mockResolvedValue(null);
    const res = await GET(getRequest(url()));
    expect(res.status).toBe(404);
  });

  it("returns no full weeks when there is no weekly cap", async () => {
    db.eventType.findUnique.mockResolvedValue(
      buildEventType({ maxBookingsPerWeek: null }),
    );
    const res = await GET(getRequest(url()));
    expect(await res.json()).toEqual({ fullWeeks: [] });
    expect(db.booking.findMany).not.toHaveBeenCalled();
  });

  it("returns only weeks that reached the cap", async () => {
    db.eventType.findUnique.mockResolvedValue(
      buildEventType({ maxBookingsPerWeek: 2, maximumNoticeDays: 14 }),
    );
    db.booking.findMany.mockResolvedValue([
      { startTime: new Date("2026-03-02T10:00:00Z") },
      { startTime: new Date("2026-03-06T10:00:00Z") },
      { startTime: new Date("2026-03-09T10:00:00Z") }, // next week: only 1
    ]);
    const res = await GET(getRequest(url()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      fullWeeks: [
        {
          from: "2026-03-01T00:00:00.000Z",
          to: "2026-03-07T00:00:00.000Z",
        },
      ],
    });
  });

  it("only counts confirmed bookings inside the booking window", async () => {
    db.eventType.findUnique.mockResolvedValue(
      buildEventType({ maxBookingsPerWeek: 1, maximumNoticeDays: 14 }),
    );
    db.booking.findMany.mockResolvedValue([]);
    const res = await GET(getRequest(url()));
    expect(await res.json()).toEqual({ fullWeeks: [] });
    const { where } = db.booking.findMany.mock.calls[0][0];
    expect(where.status).toBe("confirmed");
    expect(where.eventTypeId).toBe("evt-type-1");
    expect(where.startTime.gte).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(where.startTime.lt).toEqual(new Date("2026-03-18T12:00:00Z"));
  });

  it("reports every week as full when each reaches the cap", async () => {
    db.eventType.findUnique.mockResolvedValue(
      buildEventType({ maxBookingsPerWeek: 1, maximumNoticeDays: 14 }),
    );
    db.booking.findMany.mockResolvedValue([
      { startTime: new Date("2026-03-02T10:00:00Z") },
      { startTime: new Date("2026-03-10T10:00:00Z") },
      { startTime: new Date("2026-03-16T10:00:00Z") },
    ]);
    const body = await (await GET(getRequest(url()))).json();
    expect(body.fullWeeks).toHaveLength(3);
  });

  it("returns 500 when the database throws", async () => {
    db.eventType.findUnique.mockRejectedValue(new Error("db"));
    const res = await GET(getRequest(url()));
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
  });
});
