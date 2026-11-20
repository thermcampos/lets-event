import { addDays } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma.server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventTypeId = searchParams.get("eventTypeId");

    if (!eventTypeId) {
      return NextResponse.json(
        { error: "Missing eventTypeId" },
        { status: 400 },
      );
    }

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: "Event type not found" },
        { status: 404 },
      );
    }

    if (!eventType.maxBookingsPerWeek) {
      return NextResponse.json({ fullWeeks: [] });
    }

    const now = new Date();
    const maxDate = addDays(now, eventType.maximumNoticeDays);

    // Build week boundaries (Sun-Sat) covering the entire booking window
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - windowStart.getDay());
    windowStart.setHours(0, 0, 0, 0);

    const weeks: { weekStart: Date; weekEnd: Date }[] = [];
    let cursor = new Date(windowStart);
    while (cursor < maxDate) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 7);
      weeks.push({ weekStart: new Date(cursor), weekEnd });
      cursor = weekEnd;
    }

    // Count confirmed bookings per week in one query
    const bookings = await prisma.booking.findMany({
      where: {
        eventTypeId,
        startTime: {
          gte: windowStart,
          lt: maxDate,
        },
        status: "confirmed",
      },
      select: { startTime: true },
    });

    const fullWeeks: { from: string; to: string }[] = [];

    for (const { weekStart, weekEnd } of weeks) {
      const count = bookings.filter(
        (b) => b.startTime >= weekStart && b.startTime < weekEnd,
      ).length;

      if (count >= eventType.maxBookingsPerWeek) {
        const weekEndInclusive = new Date(weekEnd);
        weekEndInclusive.setDate(weekEndInclusive.getDate() - 1);
        fullWeeks.push({
          from: weekStart.toISOString(),
          to: weekEndInclusive.toISOString(),
        });
      }
    }

    return NextResponse.json({ fullWeeks });
  } catch (error) {
    console.error("Week status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
