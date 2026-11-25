import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AvailabilityForm } from "@/components/availability-form";
import { DeleteAvailabilityButton } from "@/components/delete-availability-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deleteAvailability,
  saveAvailability,
} from "@/lib/actions/availability";
import { prisma } from "@/lib/prisma.server";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

async function getAvailability(userId: string) {
  return await prisma.availability.findMany({
    where: { userId },
    orderBy: { dayOfWeek: "asc" },
  });
}

async function handleSaveAvailability(formData: FormData) {
  "use server";
  await saveAvailability(formData);
}

async function handleDeleteAvailability(formData: FormData) {
  "use server";
  await deleteAvailability(formData);
}

export default async function AvailabilityPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const availability = await getAvailability(session.user.id);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Availability</h1>
        <p className="text-muted-foreground">
          Set your available hours for each day of the week
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Add New Availability */}
        <Card>
          <CardHeader>
            <CardTitle>Add Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <AvailabilityForm action={handleSaveAvailability} />
          </CardContent>
        </Card>

        {/* Current Availability */}
        <Card>
          <CardHeader>
            <CardTitle>Current Availability</CardTitle>
          </CardHeader>
          <CardContent>
            {availability.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No availability set yet. Add your first time slot!
              </p>
            ) : (
              <div className="space-y-3">
                {availability.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between p-3 border rounded-md"
                  >
                    <div>
                      <p className="font-medium">
                        {
                          DAYS_OF_WEEK.find((d) => d.value === slot.dayOfWeek)
                            ?.label
                        }
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {slot.startTime} - {slot.endTime}
                      </p>
                    </div>
                    <DeleteAvailabilityButton
                      action={handleDeleteAvailability}
                      slotId={slot.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
