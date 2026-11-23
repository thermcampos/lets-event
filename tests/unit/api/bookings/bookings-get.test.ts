// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/bookings/route";
import { auth } from "@/auth";
import { prisma as prismaImport } from "@/lib/prisma.server";
import { buildBooking } from "../../helpers/builders";
import type { PrismaMock } from "../../helpers/prisma-mock";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
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
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/bookings", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "host@example.com" },
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("401 when unauthenticated, without querying bookings", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("401 when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: { email: "host@example.com" } });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the authenticated user", async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    await GET();
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { eventType: true },
      orderBy: { startTime: "desc" },
    });
  });

  it("never loads or returns the user record (password hash)", async () => {
    const { user: _user, ...bookingWithoutUser } = buildBooking();
    prisma.booking.findMany.mockResolvedValue([bookingWithoutUser]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).not.toHaveProperty("user");
    expect(JSON.stringify(json)).not.toContain("password");
    expect(prisma.booking.findMany.mock.calls[0][0].include).not.toHaveProperty(
      "user",
    );
  });

  it("500 when the query throws", async () => {
    prisma.booking.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(errorSpy).toHaveBeenCalled();
  });
});
