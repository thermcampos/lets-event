// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/prisma.server", () => ({
  prisma: {
    account: { deleteMany: mocks.deleteMany },
    user: { findFirst: mocks.findFirst, update: mocks.update },
  },
}));

import {
  disconnectGoogleCalendar,
  updateSettings,
} from "@/lib/actions/settings";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("disconnectGoogleCalendar", () => {
  it("removes the user's google account and returns to settings", async () => {
    await expect(disconnectGoogleCalendar()).rejects.toThrow(
      "REDIRECT:/dashboard/settings",
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", provider: "google" },
    });
  });

  it("does nothing without a session", async () => {
    mocks.auth.mockResolvedValue(null);
    await disconnectGoogleCalendar();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("updateSettings", () => {
  const fields = { username: "ann", name: "Ann", timezone: "Europe/Lisbon" };

  it("saves the profile and revalidates the dashboard", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await updateSettings(null, form(fields));
    expect(result).toEqual({ success: true });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { username: "ann", NOT: { id: "user-1" } },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { username: "ann", name: "Ann", timezone: "Europe/Lisbon" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("rejects a username another user holds", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user-2" });
    const result = await updateSettings(null, form(fields));
    expect(result).toEqual({ error: "Username already taken" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clears an empty username without checking uniqueness", async () => {
    const result = await updateSettings(
      null,
      form({ ...fields, username: "" }),
    );
    expect(result).toEqual({ success: true });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].data.username).toBeNull();
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await updateSettings(null, form(fields))).toEqual({
      error: "Not authenticated",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
