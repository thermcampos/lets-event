import { type NextRequest, NextResponse } from "next/server";
import { canManageBooking, getBookingToken } from "@/lib/booking-access";
import { getBookingLinks } from "@/lib/booking-links";
import {
  ACTIVE_BOOKING_STATUS,
  overlapsRange,
  validateBookingWindow,
} from "@/lib/booking-rules";
import { updateGoogleCalendarEvent } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import { sendBookingRescheduledEmail } from "@/lib/resend";
import { getWeekRange } from "@/lib/week";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { startTime, endTime } = body;

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: "Start time and end time are required" },
        { status: 400 },
      );
    }

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

    if (!(await canManageBooking(booking, getBookingToken(request)))) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 403 },
      );
    }

    if (booking.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot reschedule a cancelled booking" },
        { status: 400 },
      );
    }

    const newStartTime = new Date(startTime);
    const newEndTime = new Date(endTime);

    // Same notice / ordering rules as creating a booking
    const windowError = validateBookingWindow(
      newStartTime,
      newEndTime,
      booking.eventType,
    );
    if (windowError) {
      return NextResponse.json({ error: windowError }, { status: 400 });
    }

    // The new slot must not overlap another booking (the one being moved
    // is excluded, so shifting it by less than its own length is fine)
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        eventTypeId: booking.eventTypeId,
        id: { not: id },
        status: ACTIVE_BOOKING_STATUS,
        ...overlapsRange(newStartTime, newEndTime),
      },
    });

    if (conflictingBooking) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 },
      );
    }

    // Check weekly limit for target week, excluding the booking being moved
    if (booking.eventType.maxBookingsPerWeek !== null) {
      const { start: weekStart, end: weekEnd } = getWeekRange(
        newStartTime,
        booking.user.timezone,
      );

      const weekBookings = await prisma.booking.count({
        where: {
          eventTypeId: booking.eventTypeId,
          id: { not: id },
          startTime: { gte: weekStart, lt: weekEnd },
          status: ACTIVE_BOOKING_STATUS,
        },
      });

      if (weekBookings >= booking.eventType.maxBookingsPerWeek) {
        return NextResponse.json(
          { error: "Maximum bookings per week reached for the selected week" },
          { status: 400 },
        );
      }
    }

    // Update Google Calendar event
    let meetLink = booking.meetLink;
    if (booking.googleCalendarEventId) {
      try {
        const { cancelUrl, rescheduleUrl } = getBookingLinks(
          booking.id,
          newEndTime,
        );

        const description = [
          booking.eventType.description || "",
          "",
          booking.guestNotes ? `Notes from guest:\n${booking.guestNotes}` : "",
          "",
          "---",
          `Cancel this booking: ${cancelUrl}`,
          `Reschedule this booking: ${rescheduleUrl}`,
        ]
          .filter(Boolean)
          .join("\n");

        const updated = await updateGoogleCalendarEvent(
          booking.userId,
          booking.googleCalendarEventId,
          { startTime: newStartTime, endTime: newEndTime, description },
        );

        meetLink = updated.meetLink || booking.meetLink;
      } catch (error) {
        // Best-effort, like cancel: the guest's reschedule still goes through.
        console.error("Failed to update Google Calendar event:", error);
      }
    }

    // Update booking
    await prisma.booking.update({
      where: { id },
      data: {
        startTime: newStartTime,
        endTime: newEndTime,
        meetLink,
      },
    });

    // Send email notification
    try {
      await sendBookingRescheduledEmail({
        to: booking.user.email,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTitle: booking.eventType.title,
        startTime: newStartTime,
        endTime: newEndTime,
        previousStartTime: booking.startTime,
        previousEndTime: booking.endTime,
        meetLink,
        timezone: booking.user.timezone,
      });
    } catch (emailError) {
      console.error("Email notification error:", emailError);
    }

    // Redirect to confirmation page
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/booking/rescheduled/${id}`);
  } catch (error) {
    console.error("Error rescheduling booking:", error);
    return NextResponse.json(
      { error: "Failed to reschedule booking" },
      { status: 500 },
    );
  }
}
