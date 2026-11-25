// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createPublicBooking } from "@/lib/actions/public-booking";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const valid = {
  eventTypeId: "et-1",
  guestName: "Guest",
  guestEmail: "guest@example.com",
  guestNotes: "hi",
  startTime: "2026-03-02T10:00:00.000Z",
  duration: "30",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createPublicBooking", () => {
  it("posts start/end to the bookings API and redirects to success", async () => {
    await expect(createPublicBooking(form(valid))).rejects.toThrow(
      "REDIRECT:/booking/success",
    );
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("https://app.test/api/bookings");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      eventTypeId: "et-1",
      guestName: "Guest",
      guestEmail: "guest@example.com",
      guestNotes: "hi",
      startTime: "2026-03-02T10:00:00.000Z",
      endTime: "2026-03-02T10:30:00.000Z",
    });
  });

  it.each([
    "eventTypeId",
    "guestName",
    "guestEmail",
    "startTime",
    "duration",
  ])("requires %s", async (field) => {
    await expect(
      createPublicBooking(form({ ...valid, [field]: "" })),
    ).rejects.toThrow("Missing required fields");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("surfaces the API error message", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Slot taken" }),
    });
    await expect(createPublicBooking(form(valid))).rejects.toThrow(
      "Slot taken",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(createPublicBooking(form(valid))).rejects.toThrow(
      "Failed to create booking",
    );
  });
});
