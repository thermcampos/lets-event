// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking, buildEventType } from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import { jsonRequest, params } from "../../helpers/route";

const { prismaMock, getClient, sendEmail, patch } = vi.hoisted(() => {
  const patch = vi.fn();
  return {
    patch,
    getClient: vi.fn(),
    sendEmail: vi.fn(),
    prismaMock: {
      booking: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    },
  };
});

vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));
vi.mock("@/lib/google-calendar", () => ({
  getGoogleCalendarClient: getClient,
}));
vi.mock("@/lib/resend", () => ({ sendBookingRescheduledEmail: sendEmail }));

import { POST } from "@/app/api/bookings/[id]/reschedule/route";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook
useTestEnv();

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
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClient.mockResolvedValue({ events: { patch } });
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

  it("400 when weekly limit reached (UTC week, excludes this booking)", async () => {
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
    expect(getClient).not.toHaveBeenCalled();
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
    patch.mockResolvedValue({ data: { hangoutLink: "https://meet/new" } });
    await call();
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        eventId: "ge-1",
        sendUpdates: "all",
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
    patch.mockResolvedValue({ data: {} });
    await call();
    expect(prismaMock.booking.update.mock.calls[0][0].data.meetLink).toBe(
      "old",
    );
  });

  it("500 path: Google failure aborts before booking.update and email", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    patch.mockRejectedValue(new Error("410 gone"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to update calendar event",
    });
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("500 when getGoogleCalendarClient itself fails", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    getClient.mockRejectedValue(new Error("no account"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "Failed to update calendar event",
    });
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
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

  it("characterization: no conflict, notice or end>start validation", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    const res = await call({
      startTime: "2020-01-01T10:00:00.000Z", // in the past
      endTime: "2020-01-01T09:00:00.000Z", // before start
    });
    expect(res.status).toBe(307);
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
  });
});
