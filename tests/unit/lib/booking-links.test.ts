import { describe, expect, it, vi } from "vitest";
import { getBookingLinks } from "@/lib/booking-links";
import { signBookingToken, verifyBookingToken } from "@/lib/booking-token";
import { useTestEnv } from "../helpers/env";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook; registers vitest hooks
useTestEnv();

const EXPIRY = new Date("2026-03-02T10:30:00Z");

describe("getBookingLinks", () => {
  it("builds guest cancel and reschedule page URLs from NEXTAUTH_URL", () => {
    const token = signBookingToken("b-1", EXPIRY);
    expect(getBookingLinks("b-1", EXPIRY)).toEqual({
      cancelUrl: `https://app.test/booking/cancel/b-1?token=${token}`,
      rescheduleUrl: `https://app.test/booking/reschedule/b-1?token=${token}`,
    });
    expect(verifyBookingToken("b-1", token, new Date("2026-03-01"))).toBe(true);
  });

  it("falls back to localhost when NEXTAUTH_URL is unset", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(getBookingLinks("b-1", EXPIRY).cancelUrl).toMatch(
      /^http:\/\/localhost:3000\/booking\/cancel\/b-1\?token=/,
    );
  });
});
