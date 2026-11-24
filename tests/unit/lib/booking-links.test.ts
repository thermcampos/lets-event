import { describe, expect, it, vi } from "vitest";
import { getBookingLinks } from "@/lib/booking-links";
import { useTestEnv } from "../helpers/env";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook; registers vitest hooks
useTestEnv();

describe("getBookingLinks", () => {
  it("builds guest cancel and reschedule page URLs from NEXTAUTH_URL", () => {
    expect(getBookingLinks("b-1")).toEqual({
      cancelUrl: "https://app.test/booking/cancel/b-1",
      rescheduleUrl: "https://app.test/booking/reschedule/b-1",
    });
  });

  it("falls back to localhost when NEXTAUTH_URL is unset", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(getBookingLinks("b-1").cancelUrl).toBe(
      "http://localhost:3000/booking/cancel/b-1",
    );
  });
});
