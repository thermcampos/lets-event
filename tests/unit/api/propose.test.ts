// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking, buildEventType, buildUser } from "../helpers/builders";
import { useTestEnv } from "../helpers/env";
import type { PrismaMock } from "../helpers/prisma-mock";
import { jsonRequest } from "../helpers/route";

vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/resend", () => ({ sendProposalReceivedEmail: vi.fn() }));

import { POST } from "@/app/api/bookings/propose/route";
import { prisma } from "@/lib/prisma.server";
import { sendProposalReceivedEmail } from "@/lib/resend";

const db = prisma as unknown as PrismaMock;
const sendEmail = vi.mocked(sendProposalReceivedEmail);

const validBody = {
  eventTypeId: "evt-type-1",
  guestName: "Guest",
  guestEmail: "guest@example.com",
  guestNotes: "notes",
  proposedDate: "2026-03-10",
  proposedTime: "14:00",
  proposalMessage: "How about then?",
};

function post(body: unknown) {
  return POST(jsonRequest("https://app.test/api/bookings/propose", body));
}

describe("POST /api/bookings/propose", () => {
  useTestEnv();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.eventType.findUnique.mockResolvedValue({
      ...buildEventType(),
      user: buildUser({ timezone: "America/New_York" }),
    });
    db.booking.create.mockImplementation(async ({ data }) => ({
      ...buildBooking(),
      ...data,
      user: buildUser({ timezone: "America/New_York" }),
      eventType: buildEventType(),
    }));
    sendEmail.mockResolvedValue(undefined as never);
  });

  it.each([
    "eventTypeId",
    "guestName",
    "guestEmail",
    "proposedDate",
    "proposedTime",
  ])("returns 400 when %s is missing", async (field) => {
    const res = await post({ ...validBody, [field]: undefined });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required fields" });
    expect(db.booking.create).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed date", async () => {
    const res = await post({ ...validBody, proposedDate: "10/03/2026" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid date format/);
  });

  it("returns 400 for a malformed time", async () => {
    const res = await post({ ...validBody, proposedTime: "2pm" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid time format/);
  });

  it("returns 404 when the event type is not found or inactive", async () => {
    db.eventType.findUnique.mockResolvedValue(null);
    const res = await post(validBody);
    expect(res.status).toBe(404);
    expect(db.eventType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evt-type-1", active: true },
      }),
    );
  });

  it("returns 400 when the proposed time is in the past", async () => {
    const res = await post({ ...validBody, proposedDate: "2026-02-28" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/future/);
    expect(db.booking.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the proposed time equals now", async () => {
    // 14:00 EDT (DST began 2026-03-08) = 18:00Z
    vi.setSystemTime(new Date("2026-03-10T18:00:00Z"));
    const res = await post(validBody);
    expect(res.status).toBe(400);
  });

  it("creates a proposed booking, converting host-timezone time to UTC", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const { data } = db.booking.create.mock.calls[0][0];
    expect(data.startTime).toEqual(new Date("2026-03-10T18:00:00Z"));
    expect(data.endTime).toEqual(new Date("2026-03-10T18:30:00Z"));
    expect(data.status).toBe("proposed");
    expect(data.userId).toBe("user-1");
    expect(data.guestNotes).toBe("notes");
    expect(data.proposalMessage).toBe("How about then?");
  });

  it("stores null for empty notes and proposal message", async () => {
    await post({ ...validBody, guestNotes: "", proposalMessage: undefined });
    const { data } = db.booking.create.mock.calls[0][0];
    expect(data.guestNotes).toBeNull();
    expect(data.proposalMessage).toBeNull();
  });

  it("emails the host about the proposal", async () => {
    await post(validBody);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "host@example.com",
        guestName: "Guest",
        guestEmail: "guest@example.com",
        eventTitle: "30 Minute Meeting",
        timezone: "America/New_York",
      }),
    );
  });

  it("still returns 201 when the email fails, logging the error", async () => {
    sendEmail.mockRejectedValue(new Error("resend down"));
    const res = await post(validBody);
    expect(res.status).toBe(201);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 500 when the database throws", async () => {
    db.booking.create.mockRejectedValue(new Error("db"));
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(console.error).toHaveBeenCalled();
  });

  it("returns 500 on invalid JSON", async () => {
    const req = new Request("https://app.test/api/bookings/propose", {
      method: "POST",
      body: "{nope",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(500);
  });

  describe("host record is never exposed to the guest (public route)", () => {
    beforeEach(() => {
      db.booking.create.mockImplementation(async ({ data }) => ({
        ...buildBooking(),
        ...data,
        user: { ...buildUser(), password: "$2a$10$secret-hash" },
        eventType: buildEventType(),
      }));
    });

    it("loads only the host fields the route needs", async () => {
      await post(validBody);
      expect(db.booking.create.mock.calls[0][0].include.user).toEqual({
        select: { email: true, timezone: true },
      });
    });

    it("201 response has no user record or password", async () => {
      const res = await post(validBody);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json).not.toHaveProperty("user");
      expect(JSON.stringify(json)).not.toContain("secret-hash");
    });
  });
});
