import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { EventTypeForm } from "@/components/event-type-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  deleteEventType as removeEventType,
  updateEventType as saveEventType,
} from "@/lib/actions/event-types";
import { prisma } from "@/lib/prisma.server";
import { DeleteButton } from "./delete-button";

export default async function EditEventTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  const eventType = await prisma.eventType.findUnique({
    where: {
      id,
      userId: session.user.id,
    },
  });

  if (!eventType) {
    notFound();
  }

  async function updateEventType(formData: FormData) {
    "use server";
    await saveEventType(id, formData);
  }

  async function deleteEventType() {
    "use server";
    await removeEventType(id, "/dashboard/event-types");
  }

  return (
    <div className="py-8">
      <div className="max-w-2xl mx-auto px-4">
        <Link href="/dashboard/event-types">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Edit Event Type</CardTitle>
            <CardDescription>Update your event type settings</CardDescription>
          </CardHeader>
          <CardContent>
            <EventTypeForm
              action={updateEventType}
              defaultValues={{
                title: eventType.title,
                slug: eventType.slug,
                description: eventType.description,
                duration: eventType.duration,
                maxBookingsPerWeek: eventType.maxBookingsPerWeek,
                minimumNoticeHours: eventType.minimumNoticeHours,
                maximumNoticeDays: eventType.maximumNoticeDays,
                active: eventType.active,
              }}
              showActive
            />
            <div className="mt-6 pt-6 border-t">
              <DeleteButton deleteAction={deleteEventType} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
