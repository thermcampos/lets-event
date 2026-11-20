import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EventTypeForm } from "@/components/event-type-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { prisma } from "@/lib/prisma.server";

async function createEventType(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const duration = Number.parseInt(formData.get("duration") as string, 10);
  const maxBookingsPerWeek = formData.get("maxBookingsPerWeek")
    ? Number.parseInt(formData.get("maxBookingsPerWeek") as string, 10)
    : null;
  const minimumNoticeHours = formData.get("minimumNoticeHours")
    ? Number.parseInt(formData.get("minimumNoticeHours") as string, 10)
    : 24;
  const maximumNoticeDays = formData.get("maximumNoticeDays")
    ? Number.parseInt(formData.get("maximumNoticeDays") as string, 10)
    : 14;

  if (!title || !slug || !duration) {
    throw new Error("Missing required fields");
  }

  await prisma.eventType.create({
    data: {
      userId: session.user.id,
      title,
      slug,
      description,
      duration,
      maxBookingsPerWeek,
      minimumNoticeHours,
      maximumNoticeDays,
    },
  });

  redirect("/dashboard/event-types");
}

export default async function NewEventTypePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <Link
          href="/dashboard/event-types"
          className="text-indigo-600 hover:text-indigo-700 text-sm"
        >
          ← Back to Event Types
        </Link>
        <h1 className="text-3xl font-bold mt-4">Create Event Type</h1>
        <p className="text-muted-foreground dark:text-gray-400 mt-2">
          Define a new type of meeting you want to offer
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
          <CardDescription>
            Provide information about this event type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventTypeForm action={createEventType} />
        </CardContent>
      </Card>
    </div>
  );
}
