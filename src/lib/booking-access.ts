import { auth } from "@/auth";
import { verifyBookingToken } from "@/lib/booking-token";

/** The `token` query parameter of a cancel/reschedule request, if any. */
export function getBookingToken(request: Request) {
  return new URL(request.url).searchParams.get("token");
}

/**
 * Who may cancel or reschedule a booking: the guest holding a valid signed
 * link, or the signed-in host who owns it (the dashboard reuses the guest
 * reschedule page). Anyone else is refused.
 */
export async function canManageBooking(
  booking: { id: string; userId: string },
  token: string | null,
) {
  if (verifyBookingToken(booking.id, token)) return true;

  const session = await auth();
  return session?.user?.id === booking.userId;
}
