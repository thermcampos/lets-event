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

    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const title = formData.get("title") as string;
    const slug = formData.get("slug") as string;
    const description = formData.get("description") as string;
    const duration = Number.parseInt(formData.get("duration") as string, 10);
    const active = formData.get("active") === "on";
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

    await prisma.eventType.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: {
        title,
        slug,
        description,
        duration,
        active,
        maxBookingsPerWeek,
        minimumNoticeHours,
        maximumNoticeDays,
      },
    });

    redirect("/dashboard/event-types");
  }

  async function deleteEventType() {
    "use server";

    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    await prisma.eventType.delete({
      where: {
        id,
        userId: session.user.id,
      },
    });

    redirect("/dashboard/event-types");
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
