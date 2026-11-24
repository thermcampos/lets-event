// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBooking,
  buildEventType,
  buildUser,
} from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import { jsonRequest, params } from "../../helpers/route";

const { prismaMock, updateEvent, sendEmail } = vi.hoisted(() => ({
  updateEvent: vi.fn(),
  sendEmail: vi.fn(),
  prismaMock: {
    booking: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));
vi.mock("@/lib/google-calendar", () => ({
  updateGoogleCalendarEvent: updateEvent,
}));
vi.mock("@/lib/resend", () => ({ sendBookingRescheduledEmail: sendEmail }));

import { POST } from "@/app/api/bookings/[id]/reschedule/route";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook
useTestEnv();

// 8 days before the requested slot: inside the default 24h..14d notice window.
const NOW = new Date("2026-03-02T09:00:00Z");

const body = {
  startTime: "2026-03-10T10:00:00.000Z",
  endTime: "2026-03-10T10:30:00.000Z",
};
const call = (b: unknown = body) =>
  POST(
    jsonRequest("https://app.test/api/bookings/booking-1/reschedule", b),
    params({ id: "booking-1" }),
  );

describe("POST /api/bookings/[id]/reschedule", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.booking.findFirst.mockResolvedValue(null);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    updateEvent.mockResolvedValue({});
    sendEmail.mockResolvedValue(undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it("400 when times are missing", async () => {
    const res = await call({ startTime: body.startTime });
    expect(res.status).toBe(400);
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
  });

  it("404 when booking does not exist", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("400 when booking is cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ status: "cancelled" }),
    );
    expect((await call()).status).toBe(400);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("400 when weekly limit reached (host-timezone week, excludes this booking)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ eventType: buildEventType({ maxBookingsPerWeek: 2 }) }),
    );
    prismaMock.booking.count.mockResolvedValue(2);
    const res = await call();
    expect(res.status).toBe(400);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    const where = prismaMock.booking.count.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "booking-1" });
    // 2026-03-10 is a Tuesday: UTC week is Sun 03-08 .. Sun 03-15
    expect(where.startTime.gte.toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(where.startTime.lt.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("proceeds when weekly count is below the limit", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ eventType: buildEventType({ maxBookingsPerWeek: 2 }) }),
    );
    prismaMock.booking.count.mockResolvedValue(1);
    const res = await call();
    expect(res.status).toBe(307);
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
  });

  it("without a Google event: updates booking, emails, redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    const res = await call();
    expect(updateEvent).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/rescheduled/booking-1",
    );
  });

  it("with a Google event: patches it and stores the returned meetLink", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1", meetLink: "old" }),
    );
    updateEvent.mockResolvedValue({ meetLink: "https://meet/new" });
    await call();
    expect(updateEvent).toHaveBeenCalledWith(
      "user-1",
      "ge-1",
      expect.objectContaining({
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        description: expect.stringContaining(
          "Cancel this booking: https://app.test/booking/cancel/booking-1\nReschedule this booking: https://app.test/booking/reschedule/booking-1",
        ),
      }),
    );
    expect(prismaMock.booking.update.mock.calls[0][0].data.meetLink).toBe(
      "https://meet/new",
    );
  });

  it("keeps the old meetLink when Google returns none", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1", meetLink: "old" }),
    );
    updateEvent.mockResolvedValue({ meetLink: null });
    await call();
    expect(prismaMock.booking.update.mock.calls[0][0].data.meetLink).toBe(
      "old",
    );
  });

  it("Google patch failure is best-effort: booking still moves, emails, redirects, old meetLink kept", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1", meetLink: "old" }),
    );
    updateEvent.mockRejectedValue(new Error("google down"));
    const res = await call();
    expect(errorSpy).toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
    expect(prismaMock.booking.update.mock.calls[0][0].data.meetLink).toBe(
      "old",
    );
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/rescheduled/booking-1",
    );
  });

  it("a not-connected calendar is best-effort too", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    updateEvent.mockRejectedValue(new Error("Google Calendar not connected"));
    const res = await call();
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
  });

  it("500 when an unexpected error is thrown (e.g. booking.update)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    prismaMock.booking.update.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to reschedule booking" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("email failure is swallowed and still redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    sendEmail.mockRejectedValue(new Error("resend down"));
    const res = await call();
    expect(res.headers.get("location")).toContain("/booking/rescheduled/");
    expect(errorSpy).toHaveBeenCalled();
  });

  describe("window validation (shared with booking creation)", () => {
    const slot = (startOffsetH: number, lengthMin = 30) => {
      const start = new Date(NOW.getTime() + startOffsetH * 3_600_000);
      return {
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + lengthMin * 60_000).toISOString(),
      };
    };

    beforeEach(() => {
      prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    });

    it.each([
      [
        "end before start",
        { startTime: body.endTime, endTime: body.startTime },
      ],
      [
        "end equal to start",
        { startTime: body.startTime, endTime: body.startTime },
      ],
      ["invalid start", { startTime: "not-a-date", endTime: body.endTime }],
      ["invalid end", { startTime: body.startTime, endTime: "not-a-date" }],
    ])("400 for %s, without touching Google or the booking", async (_name, times) => {
      const res = await call(times);
      expect(res.status).toBe(400);
      expect(prismaMock.booking.findFirst).not.toHaveBeenCalled();
      expect(updateEvent).not.toHaveBeenCalled();
      expect(prismaMock.booking.update).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("400 in the past", async () => {
      const res = await call({
        startTime: "2020-01-01T10:00:00.000Z",
        endTime: "2020-01-01T10:30:00.000Z",
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/at least 24 hours in advance/);
      expect(prismaMock.booking.update).not.toHaveBeenCalled();
    });

    it("minimum notice: exactly the minimum is allowed, 1 ms earlier is not", async () => {
      const exact = slot(24);
      expect((await call(exact)).status).toBe(307);

      const early = {
        ...exact,
        startTime: new Date(Date.parse(exact.startTime) - 1).toISOString(),
      };
      const res = await call(early);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        "Booking must be at least 24 hours in advance",
      );
    });

    it("maximum notice: exactly the maximum is allowed, 1 ms later is not", async () => {
      const exact = slot(14 * 24);
      expect((await call(exact)).status).toBe(307);

      const late = {
        ...exact,
        startTime: new Date(Date.parse(exact.startTime) + 1).toISOString(),
        endTime: new Date(Date.parse(exact.endTime) + 1).toISOString(),
      };
      const res = await call(late);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        "Booking cannot be more than 14 days in advance",
      );
    });
  });

  describe("conflicts", () => {
    beforeEach(() => {
      prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    });

    it("409 when the new slot overlaps another booking, before any Google call", async () => {
      prismaMock.booking.findFirst.mockResolvedValue(
        buildBooking({ id: "other" }),
      );
      const res = await call();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "This time slot is no longer available",
      });
      expect(updateEvent).not.toHaveBeenCalled();
      expect(prismaMock.booking.update).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("looks for overlapping non-cancelled bookings of the same event type, excluding itself", async () => {
      await call();
      const { where } = prismaMock.booking.findFirst.mock.calls[0][0];
      expect(where.eventTypeId).toBe("evt-type-1");
      expect(where.id).toEqual({ not: "booking-1" });
      expect(where.status).toEqual({ notIn: ["cancelled", "declined"] });
      // overlap: existing.start < new.end && existing.end > new.start
      expect(where.startTime).toEqual({ lt: new Date(body.endTime) });
      expect(where.endTime).toEqual({ gt: new Date(body.startTime) });
    });
  });

  describe("weekly limit uses the host's timezone", () => {
    it("counts the host-local week, not the UTC week", async () => {
      // 2026-03-08T20:00Z is Sunday in UTC but Monday 09:00 in Auckland (NZDT,
      // UTC+13). The host-local week is Sun 03-08 00:00 NZDT .. Sun 03-15 00:00
      // NZDT, i.e. 2026-03-07T11:00Z .. 2026-03-14T11:00Z.
      prismaMock.booking.findUnique.mockResolvedValue(
        buildBooking({
          user: buildUser({ timezone: "Pacific/Auckland" }),
          eventType: buildEventType({ maxBookingsPerWeek: 2 }),
        }),
      );
      prismaMock.booking.count.mockResolvedValue(2);

      const res = await call({
        startTime: "2026-03-08T20:00:00.000Z",
        endTime: "2026-03-08T20:30:00.000Z",
      });

      expect(res.status).toBe(400);
      const { where } = prismaMock.booking.count.mock.calls[0][0];
      expect(where.startTime.gte.toISOString()).toBe(
        "2026-03-07T11:00:00.000Z",
      );
      expect(where.startTime.lt.toISOString()).toBe("2026-03-14T11:00:00.000Z");
    });
  });
});
