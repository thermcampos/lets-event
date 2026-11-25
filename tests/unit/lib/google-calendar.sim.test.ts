import { beforeEach, describe, expect, it, vi } from "vitest";
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
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook; registers vitest hooks
useTestEnv();

type FakeEvent = Record<string, unknown> & { id: string };

function googleError(code: number) {
  return Object.assign(new Error(code === 410 ? "Gone" : "Not Found"), {
    code,
  });
}

describe("google-calendar stateful simulation", () => {
  let events: Map<string, FakeEvent>;
  let deleted: Set<string>;
  let account: ReturnType<typeof buildAccount>;
  let nextId: number;

  beforeEach(() => {
    g.reset();
    vi.clearAllMocks();
    events = new Map();
    deleted = new Set();
    nextId = 1;
    account = buildAccount();

    prismaMock.account.findFirst.mockReset();
    prismaMock.account.findFirst.mockImplementation(async () => account);
    prismaMock.account.update.mockReset();
    prismaMock.account.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(account, data);
        return account;
      },
    );

    g.events.insert.mockReset();
    g.events.insert.mockImplementation(
      async ({ requestBody }: { requestBody: Record<string, unknown> }) => {
        const id = `ge-${nextId++}`;
        const ev = {
          ...requestBody,
          id,
          hangoutLink: `https://meet/${id}`,
          htmlLink: `https://cal/${id}`,
        };
        events.set(id, ev);
        return { data: ev };
      },
    );
    g.events.patch.mockReset();
    g.events.patch.mockImplementation(
      async ({
        eventId,
        requestBody,
      }: {
        eventId: string;
        requestBody: Record<string, unknown>;
      }) => {
        const existing = events.get(eventId);
        if (!existing) throw googleError(deleted.has(eventId) ? 410 : 404);
        Object.assign(existing, requestBody);
        return { data: existing };
      },
    );
    g.events.delete.mockReset();
    g.events.delete.mockImplementation(
      async ({ eventId }: { eventId: string }) => {
        if (!events.has(eventId)) {
          throw googleError(deleted.has(eventId) ? 410 : 404);
        }
        events.delete(eventId);
        deleted.add(eventId);
        return { data: {} };
      },
    );
  });

  const input = {
    summary: "Intro",
    startTime: new Date("2026-03-02T10:00:00Z"),
    endTime: new Date("2026-03-02T10:30:00Z"),
    attendees: ["guest@example.com"],
  };

  it("create -> reschedule -> cancel leaves no events", async () => {
    const created = await createGoogleCalendarEvent("user-1", input);
    expect(created.eventId).toBe("ge-1");
    expect(events.size).toBe(1);

    const patched = await updateGoogleCalendarEvent("user-1", "ge-1", {
      startTime: new Date("2026-03-03T11:00:00Z"),
      endTime: new Date("2026-03-03T11:30:00Z"),
    });
    expect(patched.eventId).toBe("ge-1");
    expect(events.get("ge-1")?.start).toEqual({
      dateTime: "2026-03-03T11:00:00.000Z",
    });

    await deleteGoogleCalendarEvent("user-1", "ge-1");
    expect(events.size).toBe(0);
  });

  it("update rejects unknown ids with 404 and deleted ids with 410; delete of a gone event is a no-op", async () => {
    await expect(
      updateGoogleCalendarEvent("user-1", "nope", { summary: "x" }),
    ).rejects.toMatchObject({ code: 404 });

    await createGoogleCalendarEvent("user-1", input);
    await deleteGoogleCalendarEvent("user-1", "ge-1");
    await expect(
      deleteGoogleCalendarEvent("user-1", "ge-1"),
    ).resolves.toBeUndefined();
    await expect(
      updateGoogleCalendarEvent("user-1", "ge-1", { summary: "x" }),
    ).rejects.toMatchObject({ code: 410 });
  });

  it("expired token: refresh is persisted to the account row, then the call succeeds", async () => {
    g.events.insert.mockImplementationOnce(
      async ({ requestBody }: { requestBody: Record<string, unknown> }) => {
        await g.emitTokens({
          access_token: "fresh",
          refresh_token: "fresh-refresh",
          expiry_date: 1_900_000_000_000,
        });
        const ev = {
          ...requestBody,
          id: "ge-x",
          hangoutLink: null,
          htmlLink: "h",
        };
        events.set("ge-x", ev);
        return { data: ev };
      },
    );

    const result = await createGoogleCalendarEvent("user-1", input);

    expect(account).toMatchObject({
      access_token: "fresh",
      refresh_token: "fresh-refresh",
      expires_at: 1_900_000_000,
    });
    expect(result.eventId).toBe("ge-x");
    expect(events.has("ge-x")).toBe(true);

    // The next client is built from the refreshed credentials.
    await updateGoogleCalendarEvent("user-1", "ge-x", { summary: "again" });
    expect(g.setCredentials).toHaveBeenLastCalledWith({
      access_token: "fresh",
      refresh_token: "fresh-refresh",
      expiry_date: 1_900_000_000_000,
    });
  });

  it("revoked access: invalid_grant propagates and no account update occurs", async () => {
    const revoked = { message: "invalid_grant" };
    g.events.insert.mockRejectedValue(revoked);
    g.events.patch.mockRejectedValue(revoked);
    g.events.delete.mockRejectedValue(revoked);

    await expect(createGoogleCalendarEvent("user-1", input)).rejects.toBe(
      revoked,
    );
    await expect(
      updateGoogleCalendarEvent("user-1", "ge-1", { summary: "x" }),
    ).rejects.toBe(revoked);
    await expect(deleteGoogleCalendarEvent("user-1", "ge-1")).rejects.toBe(
      revoked,
    );
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(account.access_token).toBe("access-1");
  });
});
