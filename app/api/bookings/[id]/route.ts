import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import { sendBookingStatusChangedEmail } from "@/lib/resend";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        eventTypeId: true,
        eventType: {
          select: {
            id: true,
            duration: true,
            title: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    return NextResponse.json(booking);
  } catch (error) {
    console.error("Booking fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { status } = body;

    if (
      !status ||
      !["proposed", "confirmed", "declined", "cancelled", "completed"].includes(
        status,
      )
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify booking belongs to user
    const booking = await prisma.booking.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Cancel Google Calendar event when booking is cancelled
    if (status === "cancelled" && booking.googleCalendarEventId) {
      try {
        const calendar = await getGoogleCalendarClient(booking.userId);
        await calendar.events.delete({
          calendarId: "primary",
          eventId: booking.googleCalendarEventId,
          sendUpdates: "all",
        });
      } catch (error) {
        console.error("Failed to delete Google Calendar event:", error);
      }
    }

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        eventType: true,
      },
    });

    // Send email notification
    try {
      await sendBookingStatusChangedEmail({
        to: session.user.email,
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTitle: updatedBooking.eventType.title,
        startTime: updatedBooking.startTime,
        endTime: updatedBooking.endTime,
        status,
        timezone: user.timezone,
      });
    } catch (emailError) {
      console.error("Email notification error:", emailError);
    }

    return NextResponse.json(updatedBooking);
  } catch (error) {
    console.error("Booking update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
