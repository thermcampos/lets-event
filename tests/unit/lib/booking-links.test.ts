import { describe, expect, it, vi } from "vitest";
import { buildBookingDescription, getBookingLinks } from "@/lib/booking-links";
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

describe("buildBookingDescription", () => {
  it("joins the details, drops empty ones, and ends with one link block", () => {
    expect(
      buildBookingDescription("b-1", ["Meeting with Ann", "", null, false]),
    ).toBe(
      [
        "Meeting with Ann",
        "---",
        "Cancel this booking: https://app.test/booking/cancel/b-1",
        "Reschedule this booking: https://app.test/booking/reschedule/b-1",
      ].join("\n"),
    );
  });
});
