import { fromZonedTime } from "date-fns-tz";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma.server";
import { getAvailableSlots } from "@/lib/slots";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventTypeId = searchParams.get("eventTypeId");
    const dateStr = searchParams.get("date");

    if (!eventTypeId || !dateStr) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    // Get event type with user availability
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        user: {
          include: {
            availability: true,
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: "Event type not found" },
        { status: 404 },
      );
    }

    const timezone = eventType.user.timezone;

    // Interpret the date string as midnight in the user's timezone so that day-of-week
    // lookup in getAvailableSlots stays on the correct calendar day. Using UTC midnight
    // would shift back one day for negative-offset users (Americas) and forward for
    // positive-offset users (Asia/Pacific), causing wrong availability lookups.
    const startOfDate = fromZonedTime(`${dateStr}T00:00:00`, timezone);
    const date = startOfDate;

    // Compute next-date string via UTC date arithmetic to avoid timezone boundary issues.
    const [year, month, day] = dateStr.split("-").map(Number);
    const nextDateStr = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);
    const endOfDate = fromZonedTime(`${nextDateStr}T00:00:00`, timezone);

    const existingBookings = await prisma.booking.findMany({
      where: {
        eventTypeId: eventType.id,
        startTime: {
          gte: startOfDate,
          lt: endOfDate,
        },
        status: {
          not: "cancelled",
        },
      },
    });

    // Calculate available slots
    const slots = getAvailableSlots(date, eventType, existingBookings);

    // Filter slots that respect the minimum notice window
    const minBookableTime = new Date(
      Date.now() + eventType.minimumNoticeHours * 60 * 60 * 1000,
    );
    const futureSlots = slots.filter((slot) => slot.start > minBookableTime);

    return NextResponse.json({
      slots: futureSlots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Slots API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
