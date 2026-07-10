import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BookingsTable } from "@/components/bookings-table";
import { ProposalsSection } from "@/components/proposals-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma.server";

export default async function BookingsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect("/login");
  }

  const allBookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: { eventType: true },
    orderBy: { startTime: "asc" },
  });

  const proposals = allBookings.filter((b) => b.status === "proposed");
  const confirmed = allBookings.filter((b) => b.status === "confirmed");
  const past = allBookings
    .filter((b) =>
      ["completed", "cancelled", "declined"].includes(b.status as string),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">
          Manage all your scheduled meetings
        </p>
      </div>

      {proposals.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pending Proposals
              <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                {proposals.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProposalsSection proposals={proposals} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingsTable
            bookings={confirmed}
            emptyMessage="No upcoming bookings"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingsTable bookings={past} emptyMessage="No past bookings" />
        </CardContent>
      </Card>
    </div>
  );
}
