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
import { createEventType as createNewEventType } from "@/lib/actions/event-types";

async function createEventType(formData: FormData) {
  "use server";
  await createNewEventType(formData);
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
