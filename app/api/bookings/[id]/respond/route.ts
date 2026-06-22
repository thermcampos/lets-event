import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createGoogleCalendarEvent,
  isGoogleCalendarConnected,
} from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import {
  sendProposalApprovedEmail,
  sendProposalDeclinedEmail,
} from "@/lib/resend";

export async function POST(
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
    const { action, reason } = body;

    if (!action || !["approve", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'decline'" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id, userId: user.id },
      include: { eventType: true, user: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status !== "proposed") {
      return NextResponse.json(
        { error: "Only proposed bookings can be approved or declined" },
        { status: 400 },
      );
    }

    if (action === "decline") {
      const updated = await prisma.booking.update({
        where: { id },
        data: { status: "declined", respondedAt: new Date() },
        include: { eventType: true },
      });

      try {
        await sendProposalDeclinedEmail({
          to: booking.guestEmail,
          guestName: booking.guestName,
          eventTitle: booking.eventType.title,
          startTime: booking.startTime,
          endTime: booking.endTime,
          reason: reason || null,
          timezone: booking.user.timezone,
        });
      } catch (emailError) {
        console.error("Proposal declined email error:", emailError);
      }

      return NextResponse.json(updated);
    }

    // action === "approve"
    // Use a transaction to prevent race condition when two proposals overlap
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check for conflicts inside transaction
      const conflict = await tx.booking.findFirst({
        where: {
          id: { not: id },
          eventTypeId: booking.eventTypeId,
          status: { in: ["confirmed", "proposed"] },
          OR: [
            {
              AND: [
                { startTime: { lte: booking.startTime } },
                { endTime: { gt: booking.startTime } },
              ],
            },
            {
              AND: [
                { startTime: { lt: booking.endTime } },
                { endTime: { gte: booking.endTime } },
              ],
            },
            {
              AND: [
                { startTime: { gte: booking.startTime } },
                { endTime: { lte: booking.endTime } },
              ],
            },
          ],
        },
      });

      if (conflict) {
        throw new Error("CONFLICT");
      }

      return tx.booking.update({
        where: { id },
        data: { status: "confirmed", respondedAt: new Date() },
        include: { eventType: true, user: true },
      });
    });

    // Create Google Calendar event
    let meetLink: string | null = null;
    try {
      const isConnected = await isGoogleCalendarConnected(user.id);
      if (isConnected) {
        const calendarEvent = await createGoogleCalendarEvent(user.id, {
          summary: booking.eventType.title,
          description: [
            `Meeting with ${booking.guestName}`,
            `Email: ${booking.guestEmail}`,
            booking.guestNotes ? `Notes: ${booking.guestNotes}` : "",
            booking.proposalMessage
              ? `Guest message: ${booking.proposalMessage}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          startTime: booking.startTime,
          endTime: booking.endTime,
          attendees: [booking.guestEmail],
          bookingId: booking.id,
        });

        meetLink = calendarEvent.meetLink || null;
        await prisma.booking.update({
          where: { id },
          data: {
            googleCalendarEventId: calendarEvent.eventId || null,
            meetLink,
          },
        });
      }
    } catch (calendarError) {
      console.error("Google Calendar error on proposal approval:", calendarError);
    }

    try {
      await sendProposalApprovedEmail({
        to: booking.guestEmail,
        guestName: booking.guestName,
        eventTitle: booking.eventType.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        meetLink,
        timezone: booking.user.timezone,
      });
    } catch (emailError) {
      console.error("Proposal approved email error:", emailError);
    }

    return NextResponse.json({ ...updated, meetLink });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      return NextResponse.json(
        {
          error:
            "Another booking was confirmed for this time. Cannot approve this proposal.",
        },
        { status: 409 },
      );
    }
    console.error("Proposal respond error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
