import type { Availability, Booking, EventType } from "@prisma/client";
import { addDays, addMinutes, format, isAfter, isBefore, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export function getAvailableSlots(
  date: Date,
  eventType: EventType & {
    user: { availability: Availability[]; timezone: string };
  },
  existingBookings: Booking[],
): TimeSlot[] {
  const timezone = eventType.user.timezone;

  // Convert UTC date to user's timezone to get the correct day of week
  const zonedDate = toZonedTime(date, timezone);
  const dayOfWeek = zonedDate.getDay();

  // Find availability for this day
  const dayAvailability = eventType.user.availability.filter(
    (a) => a.dayOfWeek === dayOfWeek,
  );

  if (dayAvailability.length === 0) {
    return [];
  }

  const slots: TimeSlot[] = [];

  // Get date string in user's timezone (YYYY-MM-DD)
  const dateStr = format(zonedDate, "yyyy-MM-dd");

  for (const availability of dayAvailability) {
    // Parse start and end times and convert from user's timezone to UTC
    const startZoned = fromZonedTime(
      `${dateStr}T${availability.startTime}:00`,
      timezone,
    );
    const endZoned = fromZonedTime(
      `${dateStr}T${availability.endTime}:00`,
      timezone,
    );

    // Generate slots
    let currentSlot = startZoned;
    while (
      isBefore(addMinutes(currentSlot, eventType.duration), endZoned) ||
      currentSlot.getTime() === endZoned.getTime() - eventType.duration * 60000
    ) {
      const slotEnd = addMinutes(currentSlot, eventType.duration);

      // Check if slot is available (not booked)
      const isBooked = existingBookings.some((booking) => {
        if (booking.status === "cancelled") return false;

        return (
          ((isAfter(currentSlot, booking.startTime) ||
            currentSlot.getTime() === booking.startTime.getTime()) &&
            isBefore(currentSlot, booking.endTime)) ||
          (isAfter(slotEnd, booking.startTime) &&
            (isBefore(slotEnd, booking.endTime) ||
              slotEnd.getTime() === booking.endTime.getTime())) ||
          ((isBefore(currentSlot, booking.startTime) ||
            currentSlot.getTime() === booking.startTime.getTime()) &&
            (isAfter(slotEnd, booking.endTime) ||
              slotEnd.getTime() === booking.endTime.getTime()))
        );
      });

      if (!isBooked) {
        slots.push({ start: new Date(currentSlot), end: new Date(slotEnd) });
      }

      currentSlot = addMinutes(currentSlot, eventType.duration);
    }
  }

  return slots;
}

export function getBookableDates(
  eventType: EventType & {
    user: { availability: Availability[]; timezone: string };
  },
  existingBookings: Booking[],
): Date[] {
  const dates: Date[] = [];
  const now = new Date();
  const timezone = eventType.user.timezone;

  // Calculate min and max booking dates
  const minDate = addMinutes(now, eventType.minimumNoticeHours * 60);
  const maxDate = addDays(now, eventType.maximumNoticeDays);

  // Generate dates
  let currentDate = startOfDay(minDate);
  const endDate = startOfDay(maxDate);

  while (
    isBefore(currentDate, endDate) ||
    currentDate.getTime() === endDate.getTime()
  ) {
    // Convert to user's timezone to get correct day of week
    const zonedDate = toZonedTime(currentDate, timezone);
    const dayOfWeek = zonedDate.getDay();

    // Check if there's availability for this day
    const hasAvailability = eventType.user.availability.some(
      (a) => a.dayOfWeek === dayOfWeek,
    );

    if (hasAvailability) {
      // Check if there are available slots
      const slots = getAvailableSlots(currentDate, eventType, existingBookings);
      const availableSlots = slots.filter((slot) => isAfter(slot.start, now));

      if (availableSlots.length > 0) {
        dates.push(new Date(currentDate));
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  return dates;
}
