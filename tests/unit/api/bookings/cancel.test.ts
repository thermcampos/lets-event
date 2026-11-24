// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking } from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import { getRequest, jsonRequest, params } from "../../helpers/route";

const { prismaMock, deleteEvent, sendEmail } = vi.hoisted(() => ({
  deleteEvent: vi.fn(),
  sendEmail: vi.fn(),
  prismaMock: {
    booking: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));
vi.mock("@/lib/google-calendar", () => ({
  deleteGoogleCalendarEvent: deleteEvent,
}));
vi.mock("@/lib/resend", () => ({ sendBookingCancelledEmail: sendEmail }));

import { GET, POST } from "@/app/api/bookings/[id]/cancel/route";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook
useTestEnv();

const url = "https://app.test/api/bookings/booking-1/cancel";
const handlers = {
  POST: () => POST(jsonRequest(url), params({ id: "booking-1" })),
  GET: () => GET(getRequest(url), params({ id: "booking-1" })),
} as const;

describe.each(["POST", "GET"] as const)("cancel route via %s", (method) => {
  const call = handlers[method];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteEvent.mockResolvedValue(undefined);
    sendEmail.mockResolvedValue(undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it("404 when booking is missing", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("400 when already cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ status: "cancelled" }),
    );
    const res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Booking already cancelled" });
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("without a Google event id: no Google call, booking cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    const res = await call();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: { status: "cancelled" },
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/cancelled/booking-1",
    );
  });

  it("with a Google event id: deletes the event", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    await call();
    expect(deleteEvent).toHaveBeenCalledWith("user-1", "ge-1");
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
  });

  it("Google failure is swallowed: still cancels and redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    deleteEvent.mockRejectedValue(new Error("google down"));
    const res = await call();
    expect(errorSpy).toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledWith({
      where: { id: "booking-1" },
      data: { status: "cancelled" },
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/cancelled/booking-1",
    );
  });

  it("a not-connected calendar is swallowed too", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    deleteEvent.mockRejectedValue(new Error("Google Calendar not connected"));
    const res = await call();
    expect(errorSpy).toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
    expect(res.status).toBe(307);
  });

  it("email failure is swallowed and still redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    sendEmail.mockRejectedValue(new Error("resend down"));
    const res = await call();
    expect(errorSpy).toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/cancelled/booking-1",
    );
  });

  it("500 when prisma throws unexpectedly", async () => {
    prismaMock.booking.findUnique.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to cancel booking" });
  });

  it("500 when booking.update throws", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    prismaMock.booking.update.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
