/** Guest-facing cancel and reschedule page URLs for a booking. */
export function getBookingLinks(bookingId: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return {
    cancelUrl: `${baseUrl}/booking/cancel/${bookingId}`,
    rescheduleUrl: `${baseUrl}/booking/reschedule/${bookingId}`,
  };
}
