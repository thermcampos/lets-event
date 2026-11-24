import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { getBookingLinks } from "./booking-links";
import { prisma } from "./prisma.server";

export async function getGoogleCalendarClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  // Without a refresh token the connection dies at the first token expiry, so
  // treat it as not connected and let the host reconnect (same rule as
  // isGoogleCalendarConnected).
  if (!account?.access_token || !account.refresh_token) {
    throw new Error("Google Calendar not connected");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    // Lets googleapis refresh proactively instead of waiting for a 401.
    ...(account.expires_at ? { expiry_date: account.expires_at * 1000 } : {}),
  });

  // Persist refreshed tokens. Runs as an un-awaited event listener, so it must
  // never throw: a failed write only means the next call refreshes again.
  oauth2Client.on("tokens", async (tokens) => {
    if (!tokens.access_token && !tokens.refresh_token) return;
    try {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          ...(tokens.access_token ? { access_token: tokens.access_token } : {}),
          ...(tokens.refresh_token
            ? { refresh_token: tokens.refresh_token }
            : {}),
          // Keep the stored expiry when Google doesn't send a new one.
          ...(tokens.expiry_date
            ? { expires_at: Math.floor(tokens.expiry_date / 1000) }
            : {}),
        },
      });
    } catch (error) {
      console.error("Failed to persist refreshed Google tokens:", error);
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function createGoogleCalendarEvent(
  userId: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
    bookingId?: string;
  },
) {
  const calendar = await getGoogleCalendarClient(userId);

  const { cancelUrl, rescheduleUrl } = event.bookingId
    ? getBookingLinks(event.bookingId)
    : { cancelUrl: "", rescheduleUrl: "" };

  const description = [
    event.description || "",
    "",
    "---",
    cancelUrl ? `Cancel this booking: ${cancelUrl}` : "",
    rescheduleUrl ? `Reschedule this booking: ${rescheduleUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: event.summary,
      description,
      start: {
        dateTime: event.startTime.toISOString(),
      },
      end: {
        dateTime: event.endTime.toISOString(),
      },
      attendees: event.attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    },
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink,
    htmlLink: response.data.htmlLink,
  };
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    startTime?: Date;
    endTime?: Date;
    attendees?: string[];
  },
) {
  const calendar = await getGoogleCalendarClient(userId);

  const requestBody: Record<string, unknown> = {};

  // `!== undefined` so an empty string can clear summary/description.
  if (updates.summary !== undefined) requestBody.summary = updates.summary;
  if (updates.description !== undefined) {
    requestBody.description = updates.description;
  }
  if (updates.startTime) {
    requestBody.start = { dateTime: updates.startTime.toISOString() };
  }
  if (updates.endTime) {
    requestBody.end = { dateTime: updates.endTime.toISOString() };
  }
  if (updates.attendees) {
    requestBody.attendees = updates.attendees.map((email) => ({ email }));
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    sendUpdates: "all",
    requestBody,
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink,
    htmlLink: response.data.htmlLink,
  };
}

/** True when Google reports the event as already deleted (404 Not Found / 410 Gone). */
export function isEventGoneError(error: unknown): boolean {
  const e = error as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  const status = Number(e?.code ?? e?.status ?? e?.response?.status);
  return status === 404 || status === 410;
}

/** Deletes a calendar event. An event that is already gone counts as success. */
export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string,
) {
  const calendar = await getGoogleCalendarClient(userId);

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
    });
  } catch (error) {
    if (!isEventGoneError(error)) throw error;
  }
}

export async function isGoogleCalendarConnected(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  // Connected means usable long-term: needs a refresh token as well.
  return !!(account?.access_token && account.refresh_token);
}
