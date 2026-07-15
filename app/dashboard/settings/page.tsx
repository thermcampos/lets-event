import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleCalendarConnected } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma.server";
import { AvatarUpload } from "./avatar-upload";
import { BookingLinkCard } from "./booking-link-card";
import { GoogleCalendarCard } from "./google-calendar-card";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      name: true,
      email: true,
      timezone: true,
      image: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const googleConnected = await isGoogleCalendarConnected(session.user.id);

  async function disconnectGoogleCalendar() {
    "use server";
    const session = await auth();
    if (!session?.user?.id) return;

    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    });

    redirect("/dashboard/settings");
  }

  async function updateSettings(_prevState: any, formData: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };

    const username = formData.get("username") as string;
    const name = formData.get("name") as string;
    const timezone = formData.get("timezone") as string;

    // Check if username is already taken
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id: session.user.id },
        },
      });

      if (existingUser) {
        return { error: "Username already taken" };
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        username: username || null,
        name,
        timezone,
      },
    });

    redirect("/dashboard/settings");
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings
        </p>
      </div>

      {user?.username && <BookingLinkCard username={user.username} />}

      <GoogleCalendarCard
        isConnected={googleConnected}
        disconnectAction={disconnectGoogleCalendar}
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your profile information. Username is required to share your
            booking link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AvatarUpload currentImage={user.image} name={user.name} />
          <SettingsForm user={user} updateSettings={updateSettings} />
          <div className="pt-4 border-t text-center">
            <a
              href="https://lightroasted.vps-kinghost.net/rmcampos/event.me/src/branch/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              Build version: {process.env.NEXT_PUBLIC_APP_BUILD_VERSION || "dev"}
            </a>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
