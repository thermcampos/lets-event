import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma.server";

export async function disconnectGoogleCalendar() {
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

export async function updateSettings(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const username = formData.get("username") as string;
  const name = formData.get("name") as string;
  const timezone = formData.get("timezone") as string;

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

  // Refresh the whole dashboard (the nav shows the name too) and return
  // success so the form can show a confirmation toast.
  revalidatePath("/dashboard", "layout");
  return { success: true };
}
