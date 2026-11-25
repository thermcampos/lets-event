import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma.server";

function intOrDefault<T>(value: FormDataEntryValue | null, fallback: T) {
  return value ? Number.parseInt(value as string, 10) : fallback;
}

function parseEventTypeForm(formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const duration = Number.parseInt(formData.get("duration") as string, 10);

  if (!title || !slug || !duration) {
    throw new Error("Missing required fields");
  }

  return {
    title,
    slug,
    description,
    duration,
    maxBookingsPerWeek: intOrDefault(formData.get("maxBookingsPerWeek"), null),
    minimumNoticeHours: intOrDefault(formData.get("minimumNoticeHours"), 24),
    maximumNoticeDays: intOrDefault(formData.get("maximumNoticeDays"), 14),
  };
}

export async function createEventType(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const data = parseEventTypeForm(formData);

  await prisma.eventType.create({
    data: { userId: session.user.id, ...data },
  });

  redirect("/dashboard/event-types");
}

export async function updateEventType(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const active = formData.get("active") === "on";
  const data = parseEventTypeForm(formData);

  await prisma.eventType.update({
    where: { id, userId: session.user.id },
    data: { ...data, active },
  });

  redirect("/dashboard/event-types");
}

/** Owner-scoped delete; `redirectTo` is where to land afterwards, if anywhere. */
export async function deleteEventType(id: string, redirectTo?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  await prisma.eventType.delete({
    where: { id, userId: session.user.id },
  });

  if (redirectTo) {
    redirect(redirectTo);
  }
}
