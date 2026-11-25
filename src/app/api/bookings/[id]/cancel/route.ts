import { type NextRequest, NextResponse } from "next/server";
import { canManageBooking, getBookingToken } from "@/lib/booking-access";
import { deleteGoogleCalendarEvent } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import { sendBookingCancelledEmail } from "@/lib/resend";

async function cancelBooking(id: string, token: string | null) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      user: true,
      eventType: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (!(await canManageBooking(booking, token))) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 403 },
    );
  }

  if (booking.status === "cancelled") {
    return NextResponse.json(
      { error: "Booking already cancelled" },
      { status: 400 },
    );
  }

  // Cancel Google Calendar event
  if (booking.googleCalendarEventId) {
    try {
      await deleteGoogleCalendarEvent(
        booking.userId,
        booking.googleCalendarEventId,
      );
    } catch (error) {
      console.error("Failed to delete Google Calendar event:", error);
    }
  }

  // Update booking status
  await prisma.booking.update({
    where: { id },
    data: { status: "cancelled" },
  });

  // Send email notification
  try {
    await sendBookingCancelledEmail({
      to: booking.user.email,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      eventTitle: booking.eventType.title,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.user.timezone,
    });
  } catch (emailError) {
    console.error("Email notification error:", emailError);
  }

  // Redirect to confirmation page
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return NextResponse.redirect(`${baseUrl}/booking/cancelled/${id}`);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    return await cancelBooking(id, getBookingToken(request));
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 },
    );
  }
}

// GET must never change state: mail scanners, link previewers and prefetchers
// follow links. Links created before this change point here, so send them to
// the confirmation page, where the guest confirms and the page POSTs. The
// token (if any) is carried over so the page can send it with the POST.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const token = getBookingToken(request);
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return NextResponse.redirect(`${baseUrl}/booking/cancel/${id}${query}`);
}
