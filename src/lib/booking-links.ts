/** Guest-facing cancel and reschedule page URLs for a booking. */
export function getBookingLinks(bookingId: string) {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return {
    cancelUrl: `${baseUrl}/booking/cancel/${bookingId}`,
    rescheduleUrl: `${baseUrl}/booking/reschedule/${bookingId}`,
  };
}

/**
 * The one calendar-event description for a booking: the given detail lines
 * (empty ones dropped) followed by the guest's cancel/reschedule links.
 */
export function buildBookingDescription(
  bookingId: string,
  details: Array<string | null | undefined | false>,
) {
  const { cancelUrl, rescheduleUrl } = getBookingLinks(bookingId);
  return [
    ...details.filter(Boolean),
    "---",
    `Cancel this booking: ${cancelUrl}`,
    `Reschedule this booking: ${rescheduleUrl}`,
  ].join("\n");
}
