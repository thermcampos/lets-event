import { beforeEach, describe, expect, it, vi } from "vitest";
import { signBookingToken } from "@/lib/booking-token";
import { buildAccount } from "../helpers/builders";
import { useTestEnv } from "../helpers/env";

const { g, prismaMock } = vi.hoisted(() => ({
  g: {} as ReturnType<
    typeof import("../helpers/googleapis-mock").createGoogleMock
  >,
  prismaMock: {} as ReturnType<
    typeof import("../helpers/prisma-mock").createPrismaMock
  >,
}));

vi.mock("googleapis", async () => {
  const { createGoogleMock } = await import("../helpers/googleapis-mock");
  Object.assign(g, createGoogleMock());
  return { google: g.google };
});
vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  Object.assign(prismaMock, createPrismaMock());
  return { prisma: prismaMock };
});

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarClient,
  isEventGoneError,
  isGoogleCalendarConnected,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook; registers vitest hooks
useTestEnv();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Computed per test: the signing secret is stubbed by useTestEnv.
const token = () => signBookingToken("b-1", new Date("2026-03-02T10:30:00Z"));

const baseEvent = {
  summary: "Intro call",
  description: "Chat",
  startTime: new Date("2026-03-02T10:00:00Z"),
  endTime: new Date("2026-03-02T10:30:00Z"),
  attendees: ["guest@example.com"],
};

describe("google-calendar", () => {
  beforeEach(() => {
    g.reset();
    vi.clearAllMocks();
    // clear* keeps implementations; reset the ones tests override.
    for (const fn of [
      g.events.insert,
      g.events.patch,
      g.events.delete,
      prismaMock.account.update,
      prismaMock.account.findFirst,
    ]) {
      fn.mockReset();
    }
    prismaMock.account.findFirst.mockResolvedValue(buildAccount());
  });

  describe("getGoogleCalendarClient", () => {
    it("throws when there is no account", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      await expect(getGoogleCalendarClient("user-1")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("throws when there is no refresh_token (cannot survive token expiry)", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ refresh_token: null }),
      );
      await expect(getGoogleCalendarClient("user-1")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("throws when access_token is null", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ access_token: null }),
      );
      await expect(getGoogleCalendarClient("user-1")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("queries by userId and provider google, builds client from env", async () => {
      await getGoogleCalendarClient("user-1");
      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", provider: "google" },
      });
      expect(g.oauth2Ctor).toHaveBeenCalledWith("client-id", "client-secret");
      expect(g.setCredentials).toHaveBeenCalledWith({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expiry_date: 1_800_000_000_000,
      });
      expect(g.calendarFactory).toHaveBeenCalledWith(
        expect.objectContaining({ version: "v3" }),
      );
    });

    it("passes expiry_date (ms) from the stored expires_at", async () => {
      await getGoogleCalendarClient("user-1");
      expect(g.setCredentials.mock.calls[0][0].expiry_date).toBe(
        1_800_000_000_000,
      );
    });

    it("omits expiry_date when expires_at is not stored", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ expires_at: null }),
      );
      await getGoogleCalendarClient("user-1");
      expect(g.setCredentials.mock.calls[0][0]).not.toHaveProperty(
        "expiry_date",
      );
    });
  });

  describe("token refresh listener", () => {
    it("persists access + refresh token and expires_at in seconds", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expiry_date: 1_900_000_123_456,
      });
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_at: 1_900_000_123,
        },
      });
    });

    it("omits refresh_token when Google only returns an access token", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({
        access_token: "a2",
        expiry_date: 1_900_000_000_000,
      });
      const arg = prismaMock.account.update.mock.calls[0][0];
      expect(arg.data).toEqual({
        access_token: "a2",
        expires_at: 1_900_000_000,
      });
      expect(arg.data).not.toHaveProperty("refresh_token");
    });

    it("keeps the stored expires_at when expiry_date is missing (access-only)", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({ access_token: "a2" });
      expect(prismaMock.account.update.mock.calls[0][0].data).toEqual({
        access_token: "a2",
      });
    });

    it("keeps the stored expires_at when expiry_date is missing (with refresh token)", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({ access_token: "a2", refresh_token: "r2" });
      expect(prismaMock.account.update.mock.calls[0][0].data).toEqual({
        access_token: "a2",
        refresh_token: "r2",
      });
    });

    it("floors expiry_date when converting to seconds", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({
        access_token: "a2",
        expiry_date: 1_900_000_999_999,
      });
      expect(prismaMock.account.update.mock.calls[0][0].data.expires_at).toBe(
        1_900_000_999,
      );
    });

    it("does nothing when no tokens are present", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({});
      expect(prismaMock.account.update).not.toHaveBeenCalled();
    });

    it("does nothing when only expiry_date is present", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({ expiry_date: 1_900_000_000_000 });
      expect(prismaMock.account.update).not.toHaveBeenCalled();
    });

    it("a failing update is logged, not thrown (no unhandled rejection)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      prismaMock.account.update.mockRejectedValue(new Error("db down"));
      await getGoogleCalendarClient("user-1");
      await expect(
        g.emitTokens({ access_token: "a3" }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledOnce();
      errorSpy.mockRestore();
    });
  });

  describe("createGoogleCalendarEvent", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
      g.events.insert.mockResolvedValue({
        data: {
          id: "ge-1",
          hangoutLink: "https://meet/x",
          htmlLink: "https://cal/x",
        },
      });
    });

    it("sends the exact insert payload and returns ids/links", async () => {
      const result = await createGoogleCalendarEvent("user-1", {
        ...baseEvent,
        bookingId: "b-1",
      });
      expect(g.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        conferenceDataVersion: 1,
        sendUpdates: "all",
        requestBody: {
          summary: "Intro call",
          description: [
            "Chat",
            "---",
            `Cancel this booking: https://app.test/booking/cancel/b-1?token=${token()}`,
            `Reschedule this booking: https://app.test/booking/reschedule/b-1?token=${token()}`,
          ].join("\n"),
          start: { dateTime: "2026-03-02T10:00:00.000Z" },
          end: { dateTime: "2026-03-02T10:30:00.000Z" },
          attendees: [{ email: "guest@example.com" }],
          conferenceData: {
            createRequest: {
              requestId: expect.stringMatching(UUID),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 60 },
              { method: "popup", minutes: 30 },
            ],
          },
        },
      });
      expect(result).toEqual({
        eventId: "ge-1",
        meetLink: "https://meet/x",
        htmlLink: "https://cal/x",
      });
    });

    it("uses a unique UUID requestId per call, even within the same millisecond", async () => {
      await createGoogleCalendarEvent("user-1", baseEvent);
      await createGoogleCalendarEvent("user-1", baseEvent);
      const [a, b] = g.events.insert.mock.calls.map(
        (c: any) => c[0].requestBody.conferenceData.createRequest.requestId,
      );
      expect(a).toMatch(UUID);
      expect(b).toMatch(UUID);
      expect(a).not.toBe(b);
    });

    it("omits cancel/reschedule lines without bookingId", async () => {
      await createGoogleCalendarEvent("user-1", baseEvent);
      const desc = g.events.insert.mock.calls[0][0].requestBody.description;
      expect(desc).toBe("Chat\n---");
    });

    it("handles a missing description", async () => {
      await createGoogleCalendarEvent("user-1", {
        ...baseEvent,
        description: undefined,
        bookingId: "b-1",
      });
      const desc = g.events.insert.mock.calls[0][0].requestBody.description;
      expect(desc).toBe(
        `---\nCancel this booking: https://app.test/booking/cancel/b-1?token=${token()}\nReschedule this booking: https://app.test/booking/reschedule/b-1?token=${token()}`,
      );
    });

    it("maps multiple attendees and an empty list", async () => {
      await createGoogleCalendarEvent("user-1", {
        ...baseEvent,
        attendees: ["a@x.com", "b@x.com"],
      });
      expect(g.events.insert.mock.calls[0][0].requestBody.attendees).toEqual([
        { email: "a@x.com" },
        { email: "b@x.com" },
      ]);
      await createGoogleCalendarEvent("user-1", {
        ...baseEvent,
        attendees: [],
      });
      expect(g.events.insert.mock.calls[1][0].requestBody.attendees).toEqual(
        [],
      );
    });

    it("falls back to localhost when NEXTAUTH_URL is unset", async () => {
      vi.stubEnv("NEXTAUTH_URL", "");
      await createGoogleCalendarEvent("user-1", {
        ...baseEvent,
        bookingId: "b-1",
      });
      const desc = g.events.insert.mock.calls[0][0].requestBody.description;
      expect(desc).toContain("http://localhost:3000/booking/cancel/b-1?token=");
      expect(desc).toContain(
        "http://localhost:3000/booking/reschedule/b-1?token=",
      );
    });

    it("rejects when the calendar is not connected, without calling Google", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      await expect(
        createGoogleCalendarEvent("user-1", baseEvent),
      ).rejects.toThrow("Google Calendar not connected");
      expect(g.events.insert).not.toHaveBeenCalled();
    });
  });

  describe("updateGoogleCalendarEvent", () => {
    beforeEach(() => {
      g.events.patch.mockResolvedValue({
        data: { id: "ge-1", hangoutLink: "https://meet/x", htmlLink: "h" },
      });
    });

    it("sends only provided fields, with calendarId/eventId/sendUpdates", async () => {
      const result = await updateGoogleCalendarEvent("user-1", "ge-1", {
        summary: "New",
        startTime: new Date("2026-03-03T10:00:00Z"),
      });
      expect(g.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "ge-1",
        sendUpdates: "all",
        requestBody: {
          summary: "New",
          start: { dateTime: "2026-03-03T10:00:00.000Z" },
        },
      });
      expect(result).toEqual({
        eventId: "ge-1",
        meetLink: "https://meet/x",
        htmlLink: "h",
      });
    });

    it("sends an empty requestBody for empty updates", async () => {
      await updateGoogleCalendarEvent("user-1", "ge-1", {});
      expect(g.events.patch.mock.calls[0][0].requestBody).toEqual({});
    });

    it("maps all fields, attendees to {email}", async () => {
      await updateGoogleCalendarEvent("user-1", "ge-1", {
        summary: "S",
        description: "D",
        startTime: new Date("2026-03-03T10:00:00Z"),
        endTime: new Date("2026-03-03T10:30:00Z"),
        attendees: ["a@x.com", "b@x.com"],
      });
      expect(g.events.patch.mock.calls[0][0].requestBody).toEqual({
        summary: "S",
        description: "D",
        start: { dateTime: "2026-03-03T10:00:00.000Z" },
        end: { dateTime: "2026-03-03T10:30:00.000Z" },
        attendees: [{ email: "a@x.com" }, { email: "b@x.com" }],
      });
    });

    it("empty summary/description are sent so they can clear the fields", async () => {
      await updateGoogleCalendarEvent("user-1", "ge-1", {
        summary: "",
        description: "",
      });
      expect(g.events.patch.mock.calls[0][0].requestBody).toEqual({
        summary: "",
        description: "",
      });
    });

    it("characterization: an empty attendees array is sent (clears attendees)", async () => {
      await updateGoogleCalendarEvent("user-1", "ge-1", { attendees: [] });
      expect(g.events.patch.mock.calls[0][0].requestBody).toEqual({
        attendees: [],
      });
    });
  });

  describe("deleteGoogleCalendarEvent", () => {
    it("calls delete with the expected args and resolves to undefined", async () => {
      g.events.delete.mockResolvedValue({ data: {} });
      await expect(
        deleteGoogleCalendarEvent("user-1", "ge-1"),
      ).resolves.toBeUndefined();
      expect(g.events.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "ge-1",
        sendUpdates: "all",
      });
    });

    it.each([
      ["code 404", { code: 404 }],
      ["code 410", { code: 410 }],
      ["string code '410'", { code: "410" }],
      ["status 404", { status: 404 }],
      ["response.status 410", { response: { status: 410 } }],
    ])("treats an already-deleted event as success (%s)", async (_n, err) => {
      g.events.delete.mockRejectedValue(err);
      await expect(
        deleteGoogleCalendarEvent("user-1", "ge-1"),
      ).resolves.toBeUndefined();
    });

    it.each([
      { code: 403 },
      { code: 500 },
      new Error("boom"),
    ])("still rethrows other failures (%o)", async (err) => {
      g.events.delete.mockRejectedValue(err);
      await expect(deleteGoogleCalendarEvent("user-1", "ge-1")).rejects.toBe(
        err,
      );
    });
  });

  describe("isEventGoneError", () => {
    it("is false for non-errors", () => {
      expect(isEventGoneError(undefined)).toBe(false);
      expect(isEventGoneError(null)).toBe(false);
      expect(isEventGoneError({})).toBe(false);
    });
  });

  describe("isGoogleCalendarConnected", () => {
    it("is true with an access token", async () => {
      await expect(isGoogleCalendarConnected("user-1")).resolves.toBe(true);
      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", provider: "google" },
      });
    });

    it("is false when there is no account", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      await expect(isGoogleCalendarConnected("user-1")).resolves.toBe(false);
    });

    it("is false when there is no refresh_token", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ refresh_token: null }),
      );
      await expect(isGoogleCalendarConnected("user-1")).resolves.toBe(false);
    });

    it("is false when access_token is null", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ access_token: null }),
      );
      await expect(isGoogleCalendarConnected("user-1")).resolves.toBe(false);
    });
  });

  describe("token-refresh simulation", () => {
    it("refresh happens during an API call, is persisted, and the call succeeds", async () => {
      g.events.insert.mockImplementation(async () => {
        await g.emitTokens({
          access_token: "fresh",
          expiry_date: 1_900_000_000_000,
        });
        return { data: { id: "ge-2", hangoutLink: null, htmlLink: "h" } };
      });
      const result = await createGoogleCalendarEvent("user-1", {
        summary: "s",
        startTime: new Date("2026-03-02T10:00:00Z"),
        endTime: new Date("2026-03-02T10:30:00Z"),
        attendees: [],
      });
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { access_token: "fresh", expires_at: 1_900_000_000 },
      });
      expect(result.eventId).toBe("ge-2");
    });
  });

  describe("error simulations propagate unchanged", () => {
    const errors: [string, unknown][] = [
      ["401", Object.assign(new Error("Unauthorized"), { code: 401 })],
      ["403", Object.assign(new Error("Forbidden"), { code: 403 })],
      ["404", Object.assign(new Error("Not Found"), { code: 404 })],
      ["410", Object.assign(new Error("Gone"), { code: 410 })],
      ["invalid_grant", { message: "invalid_grant" }],
      ["network", new Error("getaddrinfo ENOTFOUND www.googleapis.com")],
    ];

    it.each(errors)("insert rejecting with %s", async (_n, error) => {
      g.events.insert.mockRejectedValue(error);
      await expect(createGoogleCalendarEvent("user-1", baseEvent)).rejects.toBe(
        error,
      );
    });

    it.each(errors)("patch rejecting with %s", async (_n, error) => {
      g.events.patch.mockRejectedValue(error);
      await expect(
        updateGoogleCalendarEvent("user-1", "ge-1", { summary: "x" }),
      ).rejects.toBe(error);
    });

    // 404/410 on delete are treated as success (see deleteGoogleCalendarEvent).
    it.each(
      errors.filter(([n]) => n !== "404" && n !== "410"),
    )("delete rejecting with %s", async (_n, error) => {
      g.events.delete.mockRejectedValue(error);
      await expect(deleteGoogleCalendarEvent("user-1", "ge-1")).rejects.toBe(
        error,
      );
    });
  });
});
