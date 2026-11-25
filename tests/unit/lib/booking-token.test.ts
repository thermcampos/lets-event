// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  legacyLinksAllowed,
  signBookingToken,
  verifyBookingToken,
} from "@/lib/booking-token";
import { useTestEnv } from "../helpers/env";

// biome-ignore lint/correctness/useHookAtTopLevel: not a React hook; registers vitest hooks
useTestEnv();

const EXPIRY = new Date("2026-03-02T10:30:00Z");
const BEFORE = new Date("2026-03-01T00:00:00Z");
const AFTER = new Date("2026-03-03T00:00:00Z");

describe("booking token", () => {
  it("verifies a token for the same booking before it expires", () => {
    const token = signBookingToken("b-1", EXPIRY);
    expect(verifyBookingToken("b-1", token, BEFORE)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    expect(signBookingToken("b-1", EXPIRY)).toBe(
      signBookingToken("b-1", EXPIRY),
    );
  });

  it("rejects an expired token", () => {
    const token = signBookingToken("b-1", EXPIRY);
    expect(verifyBookingToken("b-1", token, AFTER)).toBe(false);
  });

  it("rejects a token for a different booking", () => {
    const token = signBookingToken("b-1", EXPIRY);
    expect(verifyBookingToken("b-2", token, BEFORE)).toBe(false);
  });

  it("rejects a tampered expiry (extending the lifetime)", () => {
    const [, mac] = signBookingToken("b-1", EXPIRY).split(".");
    const later = Math.floor(AFTER.getTime() / 1000) + 86400;
    expect(verifyBookingToken("b-1", `${later}.${mac}`, AFTER)).toBe(false);
  });

  it("rejects a token signed with another secret", () => {
    const token = signBookingToken("b-1", EXPIRY);
    vi.stubEnv("AUTH_SECRET", "different-secret");
    expect(verifyBookingToken("b-1", token, BEFORE)).toBe(false);
  });

  it.each([
    undefined,
    null,
    "",
    "nope",
    "123",
    "abc.def",
    "1.2.3",
    ".mac",
    "123.",
  ])("rejects malformed token %j", (token) => {
    expect(verifyBookingToken("b-1", token, BEFORE)).toBe(false);
  });

  it("falls back to NEXTAUTH_SECRET", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "legacy-secret");
    const token = signBookingToken("b-1", EXPIRY);
    expect(verifyBookingToken("b-1", token, BEFORE)).toBe(true);
  });

  it("fails closed when no secret is configured", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => signBookingToken("b-1", EXPIRY)).toThrow(/AUTH_SECRET/);
  });
});

describe("legacyLinksAllowed", () => {
  it("is off by default", () => {
    expect(legacyLinksAllowed(BEFORE)).toBe(false);
  });

  it("is on until the configured date, then off", () => {
    vi.stubEnv("BOOKING_LINK_LEGACY_UNTIL", "2026-03-02T00:00:00Z");
    expect(legacyLinksAllowed(BEFORE)).toBe(true);
    expect(legacyLinksAllowed(AFTER)).toBe(false);
  });

  it("ignores an unparseable value", () => {
    vi.stubEnv("BOOKING_LINK_LEGACY_UNTIL", "soon");
    expect(legacyLinksAllowed(BEFORE)).toBe(false);
  });
});
