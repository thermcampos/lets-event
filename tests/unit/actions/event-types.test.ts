// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma.server", () => ({
  prisma: {
    eventType: {
      create: mocks.create,
      update: mocks.update,
      delete: mocks.del,
    },
  },
}));

import {
  createEventType,
  deleteEventType,
  updateEventType,
} from "@/lib/actions/event-types";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = {
  title: "Intro",
  slug: "intro",
  description: "d",
  duration: "30",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("createEventType", () => {
  it("applies the notice defaults and redirects", async () => {
    await expect(createEventType(form(base))).rejects.toThrow(
      "REDIRECT:/dashboard/event-types",
    );
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "Intro",
        slug: "intro",
        description: "d",
        duration: 30,
        maxBookingsPerWeek: null,
        minimumNoticeHours: 24,
        maximumNoticeDays: 14,
      },
    });
  });

  it("uses the provided constraints", async () => {
    await expect(
      createEventType(
        form({
          ...base,
          maxBookingsPerWeek: "5",
          minimumNoticeHours: "2",
          maximumNoticeDays: "30",
        }),
      ),
    ).rejects.toThrow("REDIRECT:");
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      maxBookingsPerWeek: 5,
      minimumNoticeHours: 2,
      maximumNoticeDays: 30,
    });
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(createEventType(form(base))).rejects.toThrow("Unauthorized");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each(["title", "slug", "duration"])("requires %s", async (field) => {
    await expect(
      createEventType(form({ ...base, [field]: "" })),
    ).rejects.toThrow("Missing required fields");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("updateEventType", () => {
  it("updates only the owner's event type, with active from the checkbox", async () => {
    await expect(
      updateEventType("et-1", form({ ...base, active: "on" })),
    ).rejects.toThrow("REDIRECT:/dashboard/event-types");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "et-1", userId: "user-1" },
      data: {
        title: "Intro",
        slug: "intro",
        description: "d",
        duration: 30,
        active: true,
        maxBookingsPerWeek: null,
        minimumNoticeHours: 24,
        maximumNoticeDays: 14,
      },
    });
  });

  it("deactivates when the checkbox is absent", async () => {
    await expect(updateEventType("et-1", form(base))).rejects.toThrow(
      "REDIRECT:",
    );
    expect(mocks.update.mock.calls[0][0].data.active).toBe(false);
  });

  it("requires a session and valid fields", async () => {
    await expect(
      updateEventType("et-1", form({ ...base, title: "" })),
    ).rejects.toThrow("Missing required fields");
    mocks.auth.mockResolvedValue(null);
    await expect(updateEventType("et-1", form(base))).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("deleteEventType", () => {
  it("deletes only the owner's event type and redirects when asked", async () => {
    await expect(
      deleteEventType("et-1", "/dashboard/event-types"),
    ).rejects.toThrow("REDIRECT:/dashboard/event-types");
    expect(mocks.del).toHaveBeenCalledWith({
      where: { id: "et-1", userId: "user-1" },
    });
  });

  it("stays put without a redirect target", async () => {
    await deleteEventType("et-1");
    expect(mocks.del).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(deleteEventType("et-1")).rejects.toThrow("Unauthorized");
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
