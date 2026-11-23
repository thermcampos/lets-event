// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/bookings/route";
import { prisma as prismaImport } from "@/lib/prisma.server";
import { buildBooking } from "../../helpers/builders";
import type { PrismaMock } from "../../helpers/prisma-mock";

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

describe("GET /api/bookings", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("characterization: returns all bookings without any auth check, including user", async () => {
    prisma.booking.findMany.mockResolvedValue([buildBooking()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].user.email).toBe("host@example.com");
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      include: { eventType: true, user: true },
      orderBy: { startTime: "desc" },
    });
  });

  it("characterization: findMany has no where filter (not scoped to a user)", async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    await GET();
    expect(prisma.booking.findMany.mock.calls[0][0]).not.toHaveProperty(
      "where",
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
