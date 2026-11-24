// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/bookings/[id]/respond/route";
import { auth } from "@/auth";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  isGoogleCalendarConnected,
} from "@/lib/google-calendar";
import { prisma as prismaImport } from "@/lib/prisma.server";
import {
  sendProposalApprovedEmail,
  sendProposalDeclinedEmail,
} from "@/lib/resend";
import { buildBooking, buildUser } from "../../helpers/builders";
import type { PrismaMock } from "../../helpers/prisma-mock";
import { jsonRequest, params } from "../../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/google-calendar", () => ({
  isGoogleCalendarConnected: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
  deleteGoogleCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({
  sendProposalApprovedEmail: vi.fn(),
  sendProposalDeclinedEmail: vi.fn(),
}));

const prisma = prismaImport as unknown as PrismaMock;
const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const isConnected = vi.mocked(isGoogleCalendarConnected);
const createEvent = vi.mocked(createGoogleCalendarEvent);
const deleteEvent = vi.mocked(deleteGoogleCalendarEvent);
const approvedEmail = vi.mocked(sendProposalApprovedEmail);
const declinedEmail = vi.mocked(sendProposalDeclinedEmail);

// First findFirst is the ownership lookup; later calls (the in-transaction
// conflict check) find nothing unless a test says otherwise.
function mockBooking(overrides: Record<string, unknown>) {
  prisma.booking.findFirst.mockReset();
  prisma.booking.findFirst
    .mockResolvedValueOnce(buildBooking(overrides))
    .mockResolvedValue(null);
}

function respond(b: unknown) {
  return POST(
    jsonRequest("http://localhost/api/bookings/booking-1/respond", b),
    params({ id: "booking-1" }),
  );
}

describe("POST /api/bookings/[id]/respond", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authMock.mockResolvedValue({ user: { email: "host@example.com" } });
    prisma.user.findUnique.mockResolvedValue(buildUser());
    mockBooking({ status: "proposed", proposalMessage: null });
    prisma.$transaction.mockReset();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.booking.update.mockImplementation(async ({ data }) =>
      buildBooking({ ...data }),
    );
    isConnected.mockResolvedValue(false);
    approvedEmail.mockResolvedValue(undefined as never);
    declinedEmail.mockResolvedValue(undefined as never);
  });
  afterEach(() => errorSpy.mockRestore());

  describe("guards", () => {
    it("401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null);
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(401);
    });

    it.each([
      {},
      { action: "maybe" },
    ])("400 for invalid action %j", async (b) => {
      const res = await respond(b);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("approve");
    });

    it("404 when user not found", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "User not found" });
    });

    it("404 when booking is not owned by the user", async () => {
      prisma.booking.findFirst.mockReset();
      prisma.booking.findFirst.mockResolvedValue(null);
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(404);
      expect(prisma.booking.findFirst.mock.calls[0][0].where).toEqual({
        id: "booking-1",
        userId: "user-1",
      });
    });

    it.each([
      "confirmed",
      "declined",
      "cancelled",
    ])("400 when booking is %s (not proposed)", async (status) => {
      mockBooking({ status });
      const res = await respond({ action: "decline" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: "Only proposed bookings can be approved or declined",
      });
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it("500 on malformed JSON", async () => {
      const res = await POST(
        new NextRequest("http://localhost/x", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{bad",
        }),
        params({ id: "booking-1" }),
      );
      expect(res.status).toBe(500);
    });
  });

  describe("decline", () => {
    it("marks declined and emails the guest with the reason", async () => {
      const res = await respond({ action: "decline", reason: "Busy" });
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("declined");
      const data = prisma.booking.update.mock.calls[0][0].data;
      expect(data.status).toBe("declined");
      expect(data.respondedAt).toBeInstanceOf(Date);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(declinedEmail).toHaveBeenCalledTimes(1);
      const arg = declinedEmail.mock.calls[0][0];
      expect(arg.to).toBe("guest@example.com");
      expect(arg.reason).toBe("Busy");
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("passes a null reason when none is given", async () => {
      await respond({ action: "decline" });
      expect(declinedEmail.mock.calls[0][0].reason).toBeNull();
    });

    it("200 even when the email throws", async () => {
      declinedEmail.mockRejectedValue(new Error("resend down"));
      const res = await respond({ action: "decline" });
      expect(res.status).toBe(200);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("approve", () => {
    it("approves without Google and emails with null meetLink", async () => {
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("confirmed");
      expect(json.meetLink).toBeNull();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(createEvent).not.toHaveBeenCalled();
      expect(approvedEmail.mock.calls[0][0].meetLink).toBeNull();
      expect(approvedEmail.mock.calls[0][0].to).toBe("guest@example.com");
    });

    it("checks conflicts against confirmed/proposed bookings of the event type, excluding itself", async () => {
      await respond({ action: "approve" });
      const where = prisma.booking.findFirst.mock.calls[1][0].where;
      expect(where.id).toEqual({ not: "booking-1" });
      expect(where.eventTypeId).toBe("evt-type-1");
      expect(where.status).toEqual({ in: ["confirmed", "proposed"] });
    });

    it("409 when the transaction detects a conflict", async () => {
      mockBooking({ status: "proposed" });
      prisma.booking.findFirst.mockResolvedValueOnce(
        buildBooking({ id: "other" }),
      );
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toContain("Cannot approve");
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(approvedEmail).not.toHaveBeenCalled();
    });

    it("500 when the transaction throws a non-conflict error", async () => {
      prisma.$transaction.mockRejectedValue(new Error("db down"));
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Internal server error" });
    });

    it("200 even when the approval email throws", async () => {
      approvedEmail.mockRejectedValue(new Error("resend down"));
      const res = await respond({ action: "approve" });
      expect(res.status).toBe(200);
      expect(errorSpy).toHaveBeenCalled();
    });

    describe("Google connected", () => {
      beforeEach(() => {
        isConnected.mockResolvedValue(true);
      });

      it("creates the event, stores ids, and returns and emails the meetLink", async () => {
        mockBooking({
          status: "proposed",
          guestNotes: "notes",
          proposalMessage: "please",
        });
        createEvent.mockResolvedValue({
          eventId: "g-1",
          meetLink: "https://meet.google.com/x",
        } as never);
        const res = await respond({ action: "approve" });
        expect(res.status).toBe(200);
        expect((await res.json()).meetLink).toBe("https://meet.google.com/x");

        const [userId, input] = createEvent.mock.calls[0];
        expect(userId).toBe("user-1");
        expect(input.bookingId).toBe("booking-1");
        expect(input.attendees).toEqual(["guest@example.com"]);
        expect(input.description).toBe(
          [
            "Meeting with Guest",
            "Email: guest@example.com",
            "Notes: notes",
            "Guest message: please",
          ].join("\n"),
        );
        // calls[0] confirms in the transaction, calls[1] stores google info
        expect(prisma.booking.update.mock.calls[1][0]).toEqual({
          where: { id: "booking-1" },
          data: {
            googleCalendarEventId: "g-1",
            meetLink: "https://meet.google.com/x",
          },
        });
        expect(approvedEmail.mock.calls[0][0].meetLink).toBe(
          "https://meet.google.com/x",
        );
      });

      it("omits empty notes/message lines from the description", async () => {
        createEvent.mockResolvedValue({ eventId: "g-1" } as never);
        await respond({ action: "approve" });
        expect(createEvent.mock.calls[0][1].description).toBe(
          "Meeting with Guest\nEmail: guest@example.com",
        );
        expect(prisma.booking.update.mock.calls[1][0].data).toEqual({
          googleCalendarEventId: "g-1",
          meetLink: null,
        });
      });

      it("still approves when event creation fails, emailing with null meetLink", async () => {
        createEvent.mockRejectedValue(new Error("google down"));
        const res = await respond({ action: "approve" });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.status).toBe("confirmed");
        expect(json.meetLink).toBeNull();
        expect(prisma.booking.update).toHaveBeenCalledTimes(1);
        expect(approvedEmail).toHaveBeenCalledTimes(1);
        expect(approvedEmail.mock.calls[0][0].meetLink).toBeNull();
        expect(errorSpy).toHaveBeenCalled();
      });

      it("still approves when isGoogleCalendarConnected throws", async () => {
        isConnected.mockRejectedValue(new Error("db down"));
        const res = await respond({ action: "approve" });
        expect(res.status).toBe(200);
        expect(approvedEmail.mock.calls[0][0].meetLink).toBeNull();
      });

      it("booking.update after event creation fails -> event deleted, no meetLink emailed or returned", async () => {
        createEvent.mockResolvedValue({
          eventId: "g-1",
          meetLink: "https://meet.google.com/x",
        } as never);
        prisma.booking.update
          .mockImplementationOnce(async ({ data }) => buildBooking({ ...data }))
          .mockRejectedValueOnce(new Error("db down"));
        const res = await respond({ action: "approve" });
        expect(res.status).toBe(200);
        expect(deleteEvent).toHaveBeenCalledWith("user-1", "g-1");
        expect((await res.json()).meetLink).toBeNull();
        expect(approvedEmail.mock.calls[0][0].meetLink).toBeNull();
      });

      it("orphan cleanup failure is logged and approval still succeeds", async () => {
        createEvent.mockResolvedValue({ eventId: "g-1" } as never);
        prisma.booking.update
          .mockImplementationOnce(async ({ data }) => buildBooking({ ...data }))
          .mockRejectedValueOnce(new Error("db down"));
        deleteEvent.mockRejectedValue(new Error("google down"));
        const res = await respond({ action: "approve" });
        expect(res.status).toBe(200);
        expect(deleteEvent).toHaveBeenCalledOnce();
      });

      it("no cleanup when the event was linked to the booking", async () => {
        createEvent.mockResolvedValue({ eventId: "g-1" } as never);
        await respond({ action: "approve" });
        expect(deleteEvent).not.toHaveBeenCalled();
      });
    });
  });

  describe("host record is limited to the fields the route needs", () => {
    const hostSelect = { select: { email: true, timezone: true } };

    it("ownership lookup loads only host email and timezone", async () => {
      await respond({ action: "decline" });
      expect(prisma.booking.findFirst.mock.calls[0][0].include.user).toEqual(
        hostSelect,
      );
    });

    it("approve update loads only host email and timezone", async () => {
      await respond({ action: "approve" });
      expect(prisma.booking.update.mock.calls[0][0].include.user).toEqual(
        hostSelect,
      );
    });
  });
});
