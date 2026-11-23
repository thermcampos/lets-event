// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/bookings/[id]/route";
import { auth } from "@/auth";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { prisma as prismaImport } from "@/lib/prisma.server";
import {
  sendBookingCompletedGuestEmail,
  sendBookingStatusChangedEmail,
} from "@/lib/resend";
import { buildBooking, buildUser } from "../../helpers/builders";
import type { PrismaMock } from "../../helpers/prisma-mock";
import { getRequest, params } from "../../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/google-calendar", () => ({
  getGoogleCalendarClient: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({
  sendBookingStatusChangedEmail: vi.fn(),
  sendBookingCompletedGuestEmail: vi.fn(),
}));

const prisma = prismaImport as unknown as PrismaMock;
const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const getClient = vi.mocked(getGoogleCalendarClient);
const statusEmail = vi.mocked(sendBookingStatusChangedEmail);
const completedEmail = vi.mocked(sendBookingCompletedGuestEmail);

function patch(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return PATCH(
    new NextRequest("http://localhost/api/bookings/booking-1", {
      method: "PATCH",
      body: fd,
    }),
    params({ id: "booking-1" }),
  );
}

function get(id: string) {
  return GET(getRequest(`http://localhost/api/bookings/${id}`), params({ id }));
}

const pdf = (size = 10, type = "application/pdf") =>
  new File([new Uint8Array(size)], "notes.pdf", { type });

describe("GET /api/bookings/[id]", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("returns the booking summary", async () => {
    const summary = {
      id: "booking-1",
      status: "confirmed",
      eventTypeId: "evt-type-1",
      eventType: { id: "evt-type-1", duration: 30, title: "30 Minute Meeting" },
    };
    prisma.booking.findUnique.mockResolvedValue(summary);
    const res = await get("booking-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summary);
    expect(prisma.booking.findUnique.mock.calls[0][0].where).toEqual({
      id: "booking-1",
    });
  });

  it("404 when not found", async () => {
    prisma.booking.findUnique.mockResolvedValue(null);
    const res = await get("nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Booking not found" });
  });

  it("500 when the query throws", async () => {
    prisma.booking.findUnique.mockRejectedValue(new Error("db down"));
    const res = await get("b");
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("PATCH /api/bookings/[id]", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const events = { delete: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authMock.mockResolvedValue({ user: { email: "host@example.com" } });
    prisma.user.findUnique.mockResolvedValue(buildUser());
    prisma.booking.findFirst.mockResolvedValue(buildBooking());
    prisma.booking.update.mockImplementation(async ({ data }) =>
      buildBooking({ ...data }),
    );
    getClient.mockResolvedValue({ events } as never);
    events.delete.mockResolvedValue({});
    statusEmail.mockResolvedValue(undefined as never);
    completedEmail.mockResolvedValue(undefined as never);
  });
  afterEach(() => errorSpy.mockRestore());

  describe("guards", () => {
    it("401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null);
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(401);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("401 when session has no email", async () => {
      authMock.mockResolvedValue({ user: {} });
      expect((await patch({ status: "cancelled" })).status).toBe(401);
    });

    it("400 when status is missing", async () => {
      const res = await patch({});
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid status" });
    });

    it("400 when status is not a known value", async () => {
      expect((await patch({ status: "rescheduled" })).status).toBe(400);
    });

    it("404 when user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "User not found" });
    });

    it("404 when booking is not owned by the user", async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Booking not found" });
      expect(prisma.booking.findFirst.mock.calls[0][0].where).toEqual({
        id: "booking-1",
        userId: "user-1",
      });
    });
  });

  describe("status updates", () => {
    it.each([
      "proposed",
      "confirmed",
      "declined",
      "cancelled",
      "completed",
    ])("accepts status %s", async (status) => {
      const res = await patch({ status });
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe(status);
      expect(prisma.booking.update.mock.calls[0][0].data).toEqual({ status });
    });

    it("sends the host a status-changed email with user timezone", async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ timezone: "Europe/Paris" }),
      );
      await patch({ status: "confirmed" });
      expect(statusEmail).toHaveBeenCalledTimes(1);
      const arg = statusEmail.mock.calls[0][0];
      expect(arg.to).toBe("host@example.com");
      expect(arg.status).toBe("confirmed");
      expect(arg.timezone).toBe("Europe/Paris");
      expect(completedEmail).not.toHaveBeenCalled();
    });

    it("200 even when the email throws", async () => {
      statusEmail.mockRejectedValue(new Error("resend down"));
      const res = await patch({ status: "confirmed" });
      expect(res.status).toBe(200);
      expect(errorSpy).toHaveBeenCalled();
    });

    it("500 when booking.update throws", async () => {
      prisma.booking.update.mockRejectedValue(new Error("db down"));
      const res = await patch({ status: "confirmed" });
      expect(res.status).toBe(500);
    });

    it("500 when the body is not form data", async () => {
      const res = await PATCH(
        new NextRequest("http://localhost/x", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        params({ id: "booking-1" }),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("Google Calendar deletion on cancel", () => {
    it("deletes the event when cancelled with an event id", async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({ googleCalendarEventId: "g-1" }),
      );
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(200);
      expect(getClient).toHaveBeenCalledWith("user-1");
      expect(events.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "g-1",
        sendUpdates: "all",
      });
    });

    it("still cancels and logs when the Google delete fails", async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({ googleCalendarEventId: "g-1" }),
      );
      events.delete.mockRejectedValue(new Error("google down"));
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(200);
      expect(prisma.booking.update).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("still cancels and logs when the client cannot be built (not connected)", async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({ googleCalendarEventId: "g-1" }),
      );
      getClient.mockRejectedValue(new Error("not connected"));
      const res = await patch({ status: "cancelled" });
      expect(res.status).toBe(200);
      expect(events.delete).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("skips Google when there is no event id", async () => {
      await patch({ status: "cancelled" });
      expect(getClient).not.toHaveBeenCalled();
    });

    it("skips Google for non-cancel statuses even with an event id", async () => {
      prisma.booking.findFirst.mockResolvedValue(
        buildBooking({ googleCalendarEventId: "g-1" }),
      );
      await patch({ status: "confirmed" });
      expect(getClient).not.toHaveBeenCalled();
    });
  });

  describe("completed with PDF attachment", () => {
    it("emails the guest without attachment when no pdf is provided", async () => {
      await patch({ status: "completed" });
      expect(completedEmail).toHaveBeenCalledTimes(1);
      const arg = completedEmail.mock.calls[0][0];
      expect(arg.to).toBe("guest@example.com");
      expect(arg.attachment).toBeUndefined();
    });

    it("attaches a valid PDF as base64", async () => {
      const file = new File([new Uint8Array([1, 2, 3])], "notes.pdf", {
        type: "application/pdf",
      });
      const res = await patch({ status: "completed", pdf: file });
      expect(res.status).toBe(200);
      expect(completedEmail.mock.calls[0][0].attachment).toEqual({
        filename: "notes.pdf",
        content: Buffer.from([1, 2, 3]).toString("base64"),
      });
    });

    it("400 for a non-PDF attachment, before updating", async () => {
      const res = await patch({
        status: "completed",
        pdf: pdf(10, "image/png"),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Attachment must be a PDF" });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("accepts a PDF of exactly 5 MB", async () => {
      const res = await patch({
        status: "completed",
        pdf: pdf(5 * 1024 * 1024),
      });
      expect(res.status).toBe(200);
    });

    it("400 for a PDF larger than 5 MB", async () => {
      const res = await patch({
        status: "completed",
        pdf: pdf(5 * 1024 * 1024 + 1),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "PDF must be smaller than 5 MB",
      });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("400 when the PDF cannot be read", async () => {
      const spy = vi
        .spyOn(File.prototype, "arrayBuffer")
        .mockRejectedValue(new Error("read failed"));
      try {
        const res = await patch({ status: "completed", pdf: pdf() });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          error: "Failed to read PDF attachment",
        });
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("ignores the pdf when status is not completed (no validation)", async () => {
      const res = await patch({
        status: "confirmed",
        pdf: pdf(10, "image/png"),
      });
      expect(res.status).toBe(200);
      expect(completedEmail).not.toHaveBeenCalled();
    });

    it("200 when the guest email throws", async () => {
      completedEmail.mockRejectedValue(new Error("resend down"));
      const res = await patch({ status: "completed" });
      expect(res.status).toBe(200);
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
