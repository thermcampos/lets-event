import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma.server";

const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export async function saveAvailability(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const dayOfWeek = Number.parseInt(formData.get("dayOfWeek") as string, 10);
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;

  if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    throw new Error("Invalid time format");
  }

  if (startTime >= endTime) {
    throw new Error("End time must be after start time");
  }

  await prisma.availability.create({
    data: {
      userId: session.user.id,
      dayOfWeek,
      startTime,
      endTime,
    },
  });

  redirect("/dashboard/availability");
}

export async function deleteAvailability(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const id = formData.get("id") as string;

  await prisma.availability.delete({
    where: {
      id,
      userId: session.user.id,
    },
  });

  redirect("/dashboard/availability");
}
