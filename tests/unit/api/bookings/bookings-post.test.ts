// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/bookings/route";
import {
  createGoogleCalendarEvent,
  isGoogleCalendarConnected,
} from "@/lib/google-calendar";
import { prisma as prismaImport } from "@/lib/prisma.server";
import { sendBookingCreatedEmail } from "@/lib/resend";
import { buildBooking, buildEventType } from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import type { PrismaMock } from "../../helpers/prisma-mock";
import { jsonRequest } from "../../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/google-calendar", () => ({
  isGoogleCalendarConnected: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({ sendBookingCreatedEmail: vi.fn() }));

const prisma = prismaImport as unknown as PrismaMock;
const isConnected = vi.mocked(isGoogleCalendarConnected);
const createEvent = vi.mocked(createGoogleCalendarEvent);
const sendEmail = vi.mocked(sendBookingCreatedEmail);

const NOW = new Date("2026-03-02T09:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function body(overrides: Record<string, unknown> = {}) {
  const start = new Date(NOW.getTime() + 48 * HOUR);
  return {
    eventTypeId: "evt-type-1",
    guestName: "Guest",
    guestEmail: "guest@example.com",
    guestNotes: "hello",
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 30 * 60_000).toISOString(),
    ...overrides,
  };
}

function post(b: unknown = body()) {
  return POST(jsonRequest("http://localhost/api/bookings", b));
}

describe("POST /api/bookings", () => {
  useTestEnv();
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.eventType.findUnique.mockResolvedValue(buildEventType());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.booking.count.mockResolvedValue(0);
    prisma.booking.create.mockResolvedValue(buildBooking());
    prisma.booking.update.mockResolvedValue(buildBooking());
    isConnected.mockResolvedValue(false);
    sendEmail.mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe("validation", () => {
    it.each([
      "eventTypeId",
      "guestName",
      "guestEmail",
      "startTime",
      "endTime",
    ])("400 when %s is missing", async (field) => {
      const res = await post(body({ [field]: undefined }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing required fields" });
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it("400 when a field is empty", async () => {
      const res = await post(body({ guestName: "" }));
      expect(res.status).toBe(400);
    });

    it("404 for unknown event type", async () => {
      prisma.eventType.findUnique.mockResolvedValue(null);
      const res = await post();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Event type not found" });
    });
  });

  describe("notice boundaries", () => {
    const at = (ms: number) =>
      body({
        startTime: new Date(NOW.getTime() + ms).toISOString(),
        endTime: new Date(NOW.getTime() + ms + 30 * 60_000).toISOString(),
      });

    it("allows start exactly minimumNoticeHours ahead", async () => {
      const res = await post(at(24 * HOUR));
      expect(res.status).toBe(201);
    });

    it("rejects start 1 ms before minimumNoticeHours", async () => {
      const res = await post(at(24 * HOUR - 1));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("at least 24 hours");
    });

    it("allows start exactly maximumNoticeDays ahead", async () => {
      const res = await post(at(14 * DAY));
      expect(res.status).toBe(201);
    });

    it("rejects start 1 ms after maximumNoticeDays", async () => {
      const res = await post(at(14 * DAY + 1));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("more than 14 days");
    });
  });

  describe("conflicts and weekly limit", () => {
    it("409 when a non-cancelled booking overlaps (scoped by eventTypeId)", async () => {
      prisma.booking.findFirst.mockResolvedValue(buildBooking());
      const res = await post();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "This time slot is no longer available",
      });
      const where = prisma.booking.findFirst.mock.calls[0][0].where;
      expect(where.eventTypeId).toBe("evt-type-1");
      expect(where.status).toEqual({ not: "cancelled" });
      expect(where.userId).toBeUndefined();
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it("does not count weekly bookings when maxBookingsPerWeek is null", async () => {
      await post();
      expect(prisma.booking.count).not.toHaveBeenCalled();
    });

    it("400 when maxBookingsPerWeek is reached, using a Sunday-based local week", async () => {
      prisma.eventType.findUnique.mockResolvedValue(
        buildEventType({ maxBookingsPerWeek: 2 }),
      );
      prisma.booking.count.mockResolvedValue(2);
      // 2026-03-04 is a Wednesday -> week is Sun 03-01 .. Sun 03-08 (TZ=UTC)
      const res = await post(
        body({
          startTime: "2026-03-04T10:00:00Z",
          endTime: "2026-03-04T10:30:00Z",
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Maximum bookings for this week reached",
      });
      const where = prisma.booking.count.mock.calls[0][0].where;
      expect(where.startTime.gte).toEqual(new Date("2026-03-01T00:00:00Z"));
      expect(where.startTime.lt).toEqual(new Date("2026-03-08T00:00:00Z"));
      expect(where.eventTypeId).toBe("evt-type-1");
      expect(where.status).toEqual({ not: "cancelled" });
    });

    it("allows booking when below maxBookingsPerWeek", async () => {
      prisma.eventType.findUnique.mockResolvedValue(
        buildEventType({ maxBookingsPerWeek: 2 }),
      );
      prisma.booking.count.mockResolvedValue(1);
      const res = await post();
      expect(res.status).toBe(201);
    });
  });

  describe("without Google Calendar", () => {
    it("201 and emails the host without meetLink", async () => {
      const res = await post();
      expect(res.status).toBe(201);
      expect(createEvent).not.toHaveBeenCalled();
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const arg = sendEmail.mock.calls[0][0];
      expect(arg).not.toHaveProperty("meetLink");
      expect(arg.to).toBe("host@example.com");
      expect(arg.guestEmail).toBe("guest@example.com");
      expect(arg.timezone).toBe("UTC");
    });

    it("creates the booking as confirmed with null notes when empty", async () => {
      await post(body({ guestNotes: "" }));
      const data = prisma.booking.create.mock.calls[0][0].data;
      expect(data.status).toBe("confirmed");
      expect(data.guestNotes).toBeNull();
      expect(data.userId).toBe("user-1");
    });

    it("201 even if the email throws", async () => {
      sendEmail.mockRejectedValue(new Error("resend down"));
      const res = await post();
      expect(res.status).toBe(201);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("with Google Calendar connected", () => {
    beforeEach(() => {
      isConnected.mockResolvedValue(true);
      createEvent.mockResolvedValue({
        eventId: "g-evt-1",
        meetLink: "https://meet.google.com/abc",
      } as never);
    });

    it("creates the event, stores ids, emails with meetLink, returns 201", async () => {
      const res = await post();
      expect(res.status).toBe(201);
      expect((await res.json()).meetLink).toBe("https://meet.google.com/abc");

      expect(createEvent).toHaveBeenCalledTimes(1);
      const [userId, input] = createEvent.mock.calls[0];
      expect(userId).toBe("user-1");
      expect(input.bookingId).toBe("booking-1");
      expect(input.summary).toBe("30 Minute Meeting");
      expect(input.attendees).toEqual(["guest@example.com"]);
      expect(input.description).toContain("Meeting with Guest");
      expect(input.description).toContain("Email: guest@example.com");
      expect(input.description).toContain("Notes:\nhello");
      expect(input.description).toContain(
        "Cancel: https://app.test/api/bookings/booking-1/cancel",
      );
      expect(input.description).toContain(
        "Reschedule: https://app.test/booking/reschedule/booking-1",
      );

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: "booking-1" },
        data: {
          googleCalendarEventId: "g-evt-1",
          meetLink: "https://meet.google.com/abc",
        },
      });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0].meetLink).toBe(
        "https://meet.google.com/abc",
      );
    });

    it("omits the Notes section when there are no notes", async () => {
      await post(body({ guestNotes: undefined }));
      expect(createEvent.mock.calls[0][1].description).not.toContain("Notes:");
    });

    it("stores null when the event has no id or meetLink", async () => {
      createEvent.mockResolvedValue({} as never);
      await post();
      expect(prisma.booking.update.mock.calls[0][0].data).toEqual({
        googleCalendarEventId: null,
        meetLink: null,
      });
    });

    it("falls back to localhost base url when NEXTAUTH_URL is unset", async () => {
      vi.stubEnv("NEXTAUTH_URL", "");
      await post();
      expect(createEvent.mock.calls[0][1].description).toContain(
        "http://localhost:3000/api/bookings/booking-1/cancel",
      );
    });

    it("201 when the email throws (no second email)", async () => {
      sendEmail.mockRejectedValue(new Error("resend down"));
      const res = await post();
      expect(res.status).toBe(201);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("createGoogleCalendarEvent throws -> 201, one fallback email, no update", async () => {
      createEvent.mockRejectedValue(new Error("google down"));
      const res = await post();
      expect(res.status).toBe(201);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0]).not.toHaveProperty("meetLink");
      expect(errorSpy).toHaveBeenCalled();
    });

    it("createGoogleCalendarEvent throws and email throws -> still 201", async () => {
      createEvent.mockRejectedValue(new Error("google down"));
      sendEmail.mockRejectedValue(new Error("resend down"));
      const res = await post();
      expect(res.status).toBe(201);
    });

    it("characterization: booking.update throws after insert -> 201, Google event orphaned, fallback email without meetLink", async () => {
      prisma.booking.update.mockRejectedValue(new Error("db down"));
      const res = await post();
      expect(res.status).toBe(201);
      expect(createEvent).toHaveBeenCalledTimes(1);
      // no cleanup of the created Google event is attempted
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0]).not.toHaveProperty("meetLink");
      // the response is the plain booking row, not enriched with the link
      expect((await res.json()).meetLink).toBeNull();
    });
  });

  it("isGoogleCalendarConnected throws -> 201 with fallback email", async () => {
    isConnected.mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(201);
    expect(createEvent).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("500 when booking.create throws", async () => {
    prisma.booking.create.mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("500 on malformed JSON", async () => {
    const { NextRequest } = await import("next/server");
    const res = await POST(
      new NextRequest("http://localhost/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });
});
