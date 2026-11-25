import { signBookingToken } from "./booking-token";

/**
 * Guest-facing cancel and reschedule page URLs for a booking, carrying a signed
 * token that stops working at `expiresAt` (use the booking's end time).
 */
export function getBookingLinks(bookingId: string, expiresAt: Date) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const token = signBookingToken(bookingId, expiresAt);
  return {
    cancelUrl: `${baseUrl}/booking/cancel/${bookingId}?token=${token}`,
    rescheduleUrl: `${baseUrl}/booking/reschedule/${bookingId}?token=${token}`,
  };
}
