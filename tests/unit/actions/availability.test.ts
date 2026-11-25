// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  create: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma.server", () => ({
  prisma: { availability: { create: mocks.create, delete: mocks.del } },
}));

import {
  deleteAvailability,
  saveAvailability,
} from "@/lib/actions/availability";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("saveAvailability", () => {
  const valid = { dayOfWeek: "1", startTime: "09:00", endTime: "17:00" };

  it("creates the slot for the signed-in user and redirects", async () => {
    await expect(saveAvailability(form(valid))).rejects.toThrow(
      "REDIRECT:/dashboard/availability",
    );
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
      },
    });
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(saveAvailability(form(valid))).rejects.toThrow("Unauthorized");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed time", async () => {
    await expect(
      saveAvailability(form({ ...valid, startTime: "9am" })),
    ).rejects.toThrow("Invalid time format");
    await expect(
      saveAvailability(form({ ...valid, endTime: "24:00" })),
    ).rejects.toThrow("Invalid time format");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an end that is not after the start", async () => {
    await expect(
      saveAvailability(form({ ...valid, endTime: "09:00" })),
    ).rejects.toThrow("End time must be after start time");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("deleteAvailability", () => {
  it("deletes only the user's own slot and redirects", async () => {
    await expect(deleteAvailability(form({ id: "av-1" }))).rejects.toThrow(
      "REDIRECT:/dashboard/availability",
    );
    expect(mocks.del).toHaveBeenCalledWith({
      where: { id: "av-1", userId: "user-1" },
    });
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue({ user: {} });
    await expect(deleteAvailability(form({ id: "av-1" }))).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
