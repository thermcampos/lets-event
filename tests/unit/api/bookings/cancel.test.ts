// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking } from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import { getRequest, jsonRequest, params } from "../../helpers/route";

const { prismaMock, deleteEvent, sendEmail, authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  deleteEvent: vi.fn(),
  sendEmail: vi.fn(),
  prismaMock: {
    booking: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));
vi.mock("@/lib/google-calendar", () => ({
  deleteGoogleCalendarEvent: deleteEvent,
}));
vi.mock("@/lib/resend", () => ({ sendBookingCancelledEmail: sendEmail }));

import { GET, POST } from "@/app/api/bookings/[id]/cancel/route";
import { signBookingToken } from "@/lib/booking-token";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook
useTestEnv();

const url = "https://app.test/api/bookings/booking-1/cancel";
const validToken = () =>
  signBookingToken("booking-1", new Date("2099-01-01T00:00:00Z"));
const call = (token: string | null = validToken()) =>
  POST(
    jsonRequest(token ? `${url}?token=${token}` : url),
    params({ id: "booking-1" }),
  );

describe("GET (link from old emails/calendar events)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("only redirects to the confirmation page: no lookup, no cancel, no Google, no email", async () => {
    const res = await GET(getRequest(url), params({ id: "booking-1" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/cancel/booking-1",
    );
    expect(prismaMock.booking.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("GET keeps the token on the confirmation page link", () => {
  it("forwards ?token= to the page", async () => {
    const res = await GET(
      getRequest(`${url}?token=1.abc`),
      params({ id: "booking-1" }),
    );
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/cancel/booking-1?token=1.abc",
    );
  });
});

describe("cancel route authorization", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteEvent.mockResolvedValue(undefined);
    sendEmail.mockResolvedValue(undefined);
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
  });
  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  const denied = async (res: Response) => {
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Invalid or expired link" });
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  };

  it("403 without a token", async () => denied(await call(null)));
  it("403 with a garbage token", async () => denied(await call("nope")));
  it("403 with a token signed for another booking", async () =>
    denied(
      await call(signBookingToken("other", new Date("2099-01-01T00:00:00Z"))),
    ));
  it("403 with an expired token", async () =>
    denied(await call(signBookingToken("booking-1", new Date("2020-01-01")))));

  it("allows the signed-in host who owns the booking, without a token", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    expect((await call(null)).status).toBe(307);
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
  });

  it("denies a different signed-in user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    await denied(await call(null));
  });

  it("accepts token-less requests only during the legacy grace period", async () => {
    vi.stubEnv("BOOKING_LINK_LEGACY_UNTIL", "2099-01-01T00:00:00Z");
    expect((await call(null)).status).toBe(307);
    // A present-but-invalid token is never excused by the grace period.
    vi.clearAllMocks();
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    await denied(await call("nope"));
  });

  it("ignores an elapsed grace period", async () => {
    vi.stubEnv("BOOKING_LINK_LEGACY_UNTIL", "2020-01-01T00:00:00Z");
    await denied(await call(null));
  });
});

describe("cancel route via POST", () => {
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
