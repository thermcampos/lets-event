import { redirect } from "next/navigation";

/** Guest booking form submit: posts to the bookings API, then shows success. */
export async function createPublicBooking(formData: FormData) {
  const eventTypeId = formData.get("eventTypeId") as string;
  const guestName = formData.get("guestName") as string;
  const guestEmail = formData.get("guestEmail") as string;
  const guestNotes = formData.get("guestNotes") as string;
  const startTime = formData.get("startTime") as string;
  const duration = Number.parseInt(formData.get("duration") as string, 10);

  if (!eventTypeId || !guestName || !guestEmail || !startTime || !duration) {
    throw new Error("Missing required fields");
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60000);

  // Use the API route which handles Google Calendar integration
  const response = await fetch(`${process.env.NEXTAUTH_URL}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventTypeId,
      guestName,
      guestEmail,
      guestNotes,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create booking");
  }

  redirect("/booking/success");
}
