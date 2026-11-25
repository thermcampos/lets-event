import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign booking links");
  }
  return secret;
}

function sign(bookingId: string, expiresAt: number) {
  return createHmac("sha256", getSecret())
    .update(`booking:${bookingId}:${expiresAt}`)
    .digest("base64url");
}

/**
 * Token for a guest's cancel/reschedule links: `<expiry unix seconds>.<hmac>`
 * over the booking id and expiry. Stateless; rotating AUTH_SECRET revokes all.
 */
export function signBookingToken(bookingId: string, expiresAt: Date) {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return `${exp}.${sign(bookingId, exp)}`;
}

/** True only for an unexpired token signed for exactly this booking id. */
export function verifyBookingToken(
  bookingId: string,
  token: string | null | undefined,
  now: Date = new Date(),
) {
  if (!token) return false;
  const [expPart, mac, ...rest] = token.split(".");
  if (!expPart || !mac || rest.length > 0 || !/^\d+$/.test(expPart)) {
    return false;
  }
  const exp = Number(expPart);
  if (exp * 1000 < now.getTime()) return false;

  const expected = Buffer.from(sign(bookingId, exp));
  const actual = Buffer.from(mac);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Grace period for links created before tokens existed. Set
 * BOOKING_LINK_LEGACY_UNTIL to an ISO date to accept token-less requests until
 * then; unset (the default) means tokens are always required.
 */
export function legacyLinksAllowed(now: Date = new Date()) {
  const until = Date.parse(process.env.BOOKING_LINK_LEGACY_UNTIL ?? "");
  return Number.isFinite(until) && now.getTime() < until;
}
