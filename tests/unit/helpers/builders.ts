import type { PrismaMock } from "./prisma-mock";

export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "host@example.com",
    name: "Host",
    username: "host",
    timezone: "UTC",
    ...overrides,
  };
}

export function buildEventType(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-type-1",
    userId: "user-1",
    title: "30 Minute Meeting",
    slug: "30min",
    description: "Chat",
    duration: 30,
    minimumNoticeHours: 24,
    maximumNoticeDays: 14,
    maxBookingsPerWeek: null as number | null,
    ...overrides,
  };
}

export function buildBooking(overrides: Record<string, unknown> = {}) {
  const user = buildUser();
  const eventType = buildEventType();
  return {
    id: "booking-1",
    userId: user.id,
    eventTypeId: eventType.id,
    guestName: "Guest",
    guestEmail: "guest@example.com",
    guestNotes: null as string | null,
    startTime: new Date("2026-03-02T10:00:00Z"),
    endTime: new Date("2026-03-02T10:30:00Z"),
    status: "confirmed",
    googleCalendarEventId: null as string | null,
    meetLink: null as string | null,
    user,
    eventType,
    ...overrides,
  };
}

export function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    userId: "user-1",
    provider: "google",
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_at: 1_800_000_000,
    ...overrides,
  };
}

export type { PrismaMock };
