import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  disconnectGoogleCalendar as disconnectGoogle,
  updateSettings as saveSettings,
} from "@/lib/actions/settings";
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
    await disconnectGoogle();
  }

  async function updateSettings(prevState: unknown, formData: FormData) {
    "use server";
    return await saveSettings(prevState, formData);
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
              Build version:{" "}
              {process.env.NEXT_PUBLIC_APP_BUILD_VERSION || "dev"}
            </a>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
