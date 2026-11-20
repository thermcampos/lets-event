import { expect, type Page, test } from "@playwright/test";
import { prisma } from "@/lib/prisma.server";
import { createDbUser, deleteDbUser, login, uniqueId } from "./helpers";

// Each test gets its own user: a shared one raced across parallel
// workers/browsers (one worker's cleanup deleted another's data).
let user: Awaited<ReturnType<typeof createDbUser>>;
let eventTypeId: string;

test.beforeEach(async () => {
  user = await createDbUser("Booking Mgmt Test User");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await prisma.availability.create({
    data: {
      userId: user.id,
      dayOfWeek: tomorrow.getDay(),
      startTime: "09:00",
      endTime: "17:00",
    },
  });

  const eventType = await prisma.eventType.create({
    data: {
      userId: user.id,
      title: "Test Meeting",
      slug: `test-meeting-${uniqueId()}`,
      description: "A test meeting for booking management",
      duration: 30,
      active: true,
      minimumNoticeHours: 1,
      maximumNoticeDays: 14,
      maxBookingsPerWeek: 10,
    },
  });
  eventTypeId = eventType.id;
});

test.afterEach(async () => {
  await deleteDbUser(user?.id);
});

async function createBooking(daysAhead: number, hour: number, guest: string) {
  const start = new Date();
  start.setDate(start.getDate() + daysAhead);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);

  return prisma.booking.create({
    data: {
      eventTypeId,
      userId: user.id,
      guestName: guest,
      guestEmail: `${guest.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      guestNotes: "Test notes",
      startTime: start,
      endTime: end,
      status: "confirmed",
    },
  });
}

/** A booking row in the bookings table. */
function bookingRow(page: Page, guestEmail: string) {
  return page.locator("div.border.rounded-lg").filter({ hasText: guestEmail });
}

test.describe("Booking Management", () => {
  test("should display bookings page with navigation", async ({ page }) => {
    await login(page, user);

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Bookings" })
      .first()
      .click();

    await expect(page).toHaveURL("/dashboard/bookings");
    await expect(page.locator("h1")).toContainText("Bookings");
  });

  test("should show empty state when no bookings", async ({ page }) => {
    await login(page, user);
    await page.goto("/dashboard/bookings");

    await expect(page.getByText("No upcoming bookings")).toBeVisible();
    await expect(page.getByText("No past bookings")).toBeVisible();
  });

  test("should display bookings when they exist", async ({ page }) => {
    await createBooking(1, 10, "Test Guest");

    await login(page, user);
    await page.goto("/dashboard/bookings");

    const row = bookingRow(page, "test-guest@example.com");
    await expect(
      row.getByRole("heading", { name: "Test Meeting" }),
    ).toBeVisible();
    await expect(row.getByText("Test Guest")).toBeVisible();
    await expect(row.getByText("confirmed")).toBeVisible();
  });

  test("should cancel a booking", async ({ page }) => {
    const booking = await createBooking(2, 14, "Cancel Test");

    await login(page, user);
    await page.goto("/dashboard/bookings");

    const row = bookingRow(page, "cancel-test@example.com");
    await row.getByRole("button", { name: "Cancel" }).click();

    await expect(
      page.getByText("Booking cancelled successfully"),
    ).toBeVisible();
    await expect(row.getByText("cancelled", { exact: true })).toBeVisible();

    const cancelled = await prisma.booking.findUnique({
      where: { id: booking.id },
    });
    expect(cancelled?.status).toBe("cancelled");
  });
});
