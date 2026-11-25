import { ArrowLeft, Calendar, Clock, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicBookingForm } from "@/components/public-booking-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createPublicBooking } from "@/lib/actions/public-booking";
import { prisma } from "@/lib/prisma.server";

type Props = {
  params: Promise<{
    username: string;
    slug: string;
  }>;
  searchParams: Promise<{
    date?: string;
    time?: string;
  }>;
};

async function createBooking(formData: FormData) {
  "use server";
  await createPublicBooking(formData);
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: Props) {
  const { username, slug } = await params;
  const { date, time } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    notFound();
  }

  const eventType = await prisma.eventType.findFirst({
    where: {
      slug,
      userId: user.id,
      active: true,
    },
  });

  if (!eventType) {
    notFound();
  }

  const availability = await prisma.availability.findMany({
    where: { userId: user.id },
    orderBy: { dayOfWeek: "asc" },
  });

  const showBookingForm = date && time;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="border-b bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-indigo-600" />
              <span className="ml-2 text-xl font-bold">Let&apos;s Event</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showBookingForm ? (
          <div>
            <Link
              href={`/${username}/${slug}`}
              className="text-indigo-600 hover:text-indigo-700 text-sm inline-flex items-center gap-1 mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to date selection
            </Link>

            <Card>
              <CardHeader>
                <CardTitle>Book {eventType.title}</CardTitle>
                <CardDescription>
                  {eventType.description || "Please provide your details"}
                </CardDescription>
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {user.name}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {eventType.duration} minutes
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(`${date}T${time}`).toLocaleString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <PublicBookingForm
                  action={createBooking}
                  eventTypeId={eventType.id}
                  duration={eventType.duration}
                  startTime={`${date}T${time}:00`}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div>
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{user.name}</CardTitle>
                    <CardDescription className="text-base">
                      {eventType.title}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {eventType.duration} minutes
                  </div>
                </div>
                {eventType.description && (
                  <p className="mt-4 text-gray-700 dark:text-gray-300">
                    {eventType.description}
                  </p>
                )}
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select a Date & Time</CardTitle>
                <CardDescription>
                  Choose a time that works best for you
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-muted-foreground mb-4">
                    Calendar integration coming soon...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For now, you can test the booking form by adding
                    ?date=2024-03-20&time=10:00 to the URL
                  </p>
                  {availability.length > 0 && (
                    <div className="mt-6 text-left max-w-md mx-auto">
                      <h3 className="font-semibold mb-2">Available Hours:</h3>
                      <div className="space-y-1 text-sm">
                        {availability.map((slot) => (
                          <div key={slot.id}>
                            <span className="font-medium">
                              {
                                [
                                  "Sunday",
                                  "Monday",
                                  "Tuesday",
                                  "Wednesday",
                                  "Thursday",
                                  "Friday",
                                  "Saturday",
                                ][slot.dayOfWeek]
                              }
                              :
                            </span>{" "}
                            {slot.startTime} - {slot.endTime}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
