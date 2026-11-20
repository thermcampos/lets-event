import { addMinutes, isAfter } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma.server";
import { sendProposalReceivedEmail } from "@/lib/resend";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      eventTypeId,
      guestName,
      guestEmail,
      guestNotes,
      proposedDate,
      proposedTime,
      proposalMessage,
    } = body;

    if (
      !eventTypeId ||
      !guestName ||
      !guestEmail ||
      !proposedDate ||
      !proposedTime
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (!/^\d{2}:\d{2}$/.test(proposedTime)) {
      return NextResponse.json(
        { error: "Invalid time format. Use HH:mm" },
        { status: 400 },
      );
    }

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId, active: true },
      include: { user: true },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: "Event type not found" },
        { status: 404 },
      );
    }

    // Convert proposed date+time from host's timezone to UTC
    const startTime = fromZonedTime(
      `${proposedDate}T${proposedTime}:00`,
      eventType.user.timezone,
    );
    const endTime = addMinutes(startTime, eventType.duration);

    const now = new Date();

    if (!isAfter(startTime, now)) {
      return NextResponse.json(
        { error: "Proposed time must be in the future" },
        { status: 400 },
      );
    }

    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        userId: eventType.userId,
        guestName,
        guestEmail,
        guestNotes: guestNotes || null,
        proposalMessage: proposalMessage || null,
        startTime,
        endTime,
        status: "proposed",
      },
      include: {
        eventType: true,
        user: true,
      },
    });

    try {
      await sendProposalReceivedEmail({
        to: booking.user.email,
        guestName,
        guestEmail,
        eventTitle: booking.eventType.title,
        startTime,
        endTime,
        proposalMessage,
        timezone: booking.user.timezone,
      });
    } catch (emailError) {
      console.error("Proposal email notification error:", emailError);
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    console.error("Proposal creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
