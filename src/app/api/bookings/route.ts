import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { bookingHostSelect } from "@/lib/booking-host";
import {
  ACTIVE_BOOKING_STATUS,
  overlapsRange,
  validateBookingWindow,
} from "@/lib/booking-rules";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  isGoogleCalendarConnected,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import { sendBookingCreatedEmail } from "@/lib/resend";
import { getWeekRange } from "@/lib/week";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      eventTypeId,
      guestName,
      guestEmail,
      guestNotes,
      startTime,
      endTime,
    } = body;

    // Validate required fields
    if (!eventTypeId || !guestName || !guestEmail || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get event type
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: { user: { select: { timezone: true } } },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: "Event type not found" },
        { status: 404 },
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Validate ordering and notice window (shared with reschedule)
    const windowError = validateBookingWindow(start, end, eventType);
    if (windowError) {
      return NextResponse.json({ error: windowError }, { status: 400 });
    }

    // Check for conflicts
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        eventTypeId,
        status: ACTIVE_BOOKING_STATUS,
        ...overlapsRange(start, end),
      },
    });

    if (conflictingBooking) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 },
      );
    }

    // Check max bookings per week if set
    if (eventType.maxBookingsPerWeek) {
      const { start: weekStart, end: weekEnd } = getWeekRange(
        start,
        eventType.user.timezone,
      );

      const weekBookings = await prisma.booking.count({
        where: {
          eventTypeId,
          userId: eventType.userId,
          startTime: {
            gte: weekStart,
            lt: weekEnd,
          },
          status: ACTIVE_BOOKING_STATUS,
        },
      });

      if (weekBookings >= eventType.maxBookingsPerWeek) {
        return NextResponse.json(
          { error: "Maximum bookings for this week reached" },
          { status: 400 },
        );
      }
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        userId: eventType.userId,
        guestName,
        guestEmail,
        guestNotes: guestNotes || null,
        startTime: start,
        endTime: end,
        status: "confirmed",
      },
      include: {
        eventType: true,
        user: { select: bookingHostSelect },
      },
    });

    // This route is public: never echo the host record back to the guest.
    const { user: _host, ...publicBooking } = booking;

    // Try to create Google Calendar event
    let orphanedEventId: string | null | undefined;
    try {
      const isConnected = await isGoogleCalendarConnected(eventType.userId);
      if (isConnected) {
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        const cancelUrl = `${baseUrl}/api/bookings/${booking.id}/cancel`;
        const rescheduleUrl = `${baseUrl}/booking/reschedule/${booking.id}`;

        const descriptionParts = [
          `Meeting with ${guestName}`,
          `Email: ${guestEmail}`,
        ];

        if (guestNotes) {
          descriptionParts.push("", "Notes:", guestNotes);
        }

        descriptionParts.push(
          "",
          "---",
          "Manage your booking:",
          `Cancel: ${cancelUrl}`,
          `Reschedule: ${rescheduleUrl}`,
        );

        const calendarEvent = await createGoogleCalendarEvent(
          eventType.userId,
          {
            summary: eventType.title,
            description: descriptionParts.join("\n"),
            startTime: start,
            endTime: end,
            attendees: [guestEmail],
            bookingId: booking.id,
          },
        );

        orphanedEventId = calendarEvent.eventId;

        // Update booking with Google Calendar info
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            googleCalendarEventId: calendarEvent.eventId || null,
            meetLink: calendarEvent.meetLink || null,
          },
        });
        orphanedEventId = undefined; // booking now references the event

        // Send email notification
        try {
          await sendBookingCreatedEmail({
            to: booking.user.email,
            guestName,
            guestEmail,
            eventTitle: booking.eventType.title,
            startTime: start,
            endTime: end,
            guestNotes,
            meetLink: calendarEvent.meetLink,
            timezone: booking.user.timezone,
          });
        } catch (emailError) {
          console.error("Email notification error:", emailError);
        }

        // Return booking with calendar info
        return NextResponse.json(
          { ...publicBooking, meetLink: calendarEvent.meetLink },
          { status: 201 },
        );
      }
    } catch (calendarError) {
      console.error("Google Calendar error:", calendarError);
      // Continue without calendar event - booking was still created.
      // If the event was created but never linked to the booking, remove it.
      if (orphanedEventId) {
        try {
          await deleteGoogleCalendarEvent(eventType.userId, orphanedEventId);
        } catch (cleanupError) {
          console.error("Failed to clean up orphaned event:", cleanupError);
        }
      }
    }

    // Send email notification (no calendar integration)
    try {
      await sendBookingCreatedEmail({
        to: booking.user.email,
        guestName,
        guestEmail,
        eventTitle: booking.eventType.title,
        startTime: start,
        endTime: end,
        guestNotes,
        timezone: booking.user.timezone,
      });
    } catch (emailError) {
      console.error("Email notification error:", emailError);
    }

    return NextResponse.json(publicBooking, { status: 201 });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bookings = await prisma.booking.findMany({
      where: { userId: session.user.id },
      include: {
        eventType: true,
      },
      orderBy: {
        startTime: "desc",
      },
    });

    return NextResponse.json(bookings);
  } catch (error) {
    console.error("Fetch bookings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
