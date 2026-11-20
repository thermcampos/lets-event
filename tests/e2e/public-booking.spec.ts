import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma.server";
import {
  createDbUser,
  deleteDbUser,
  expectNotFound,
  uniqueId,
} from "./helpers";

test.describe("Public Booking Flow", () => {
  let testUserId: string;
  let testUsername: string;
  let testEventTypeSlug: string;

  test.beforeAll(async () => {
    const user = await createDbUser("Booking Test User");
    testUserId = user.id;
    testUsername = user.username;

    await prisma.availability.createMany({
      data: [
        {
          userId: testUserId,
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        },
        {
          userId: testUserId,
          dayOfWeek: 2,
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const eventType = await prisma.eventType.create({
      data: {
        userId: testUserId,
        title: "Test Meeting",
        slug: `test-meeting-${uniqueId()}`,
        description: "A test meeting for E2E tests",
        duration: 30,
        active: true,
      },
    });
    testEventTypeSlug = eventType.slug;
  });

  test.afterAll(async () => {
    await deleteDbUser(testUserId);
  });

  test("should display public booking page", async ({ page }) => {
    await page.goto(`/${testUsername}/${testEventTypeSlug}`);

    await expect(page.getByText("Booking Test User")).toBeVisible();
    await expect(page.getByText("Test Meeting", { exact: true })).toBeVisible();
    await expect(page.getByText("30 minutes")).toBeVisible();
    await expect(page.getByText("A test meeting for E2E tests")).toBeVisible();
  });

  test("should show availability on booking page", async ({ page }) => {
    await page.goto(`/${testUsername}/${testEventTypeSlug}`);

    await expect(page.getByText("Available Hours:")).toBeVisible();
    await expect(page.getByText("Monday: 09:00 - 17:00")).toBeVisible();
    await expect(page.getByText("Tuesday: 09:00 - 17:00")).toBeVisible();
  });

  test("should show booking form with date and time params", async ({
    page,
  }) => {
    await page.goto(
      `/${testUsername}/${testEventTypeSlug}?date=2024-03-20&time=10:00`,
    );

    await expect(page.getByText("Book Test Meeting")).toBeVisible();
    await expect(page.getByLabel("Your Name *")).toBeVisible();
    await expect(page.getByLabel("Your Email *")).toBeVisible();
    await expect(page.getByLabel("Additional Notes")).toBeVisible();
  });

  test("should create a booking", async ({ page }) => {
    // 2 days ahead satisfies the default minimum (24h) and maximum (14d) notice
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const dateStr = futureDate.toISOString().split("T")[0];

    await page.goto(
      `/${testUsername}/${testEventTypeSlug}?date=${dateStr}&time=14:00`,
    );

    await page.fill('input[name="guestName"]', "John Doe");
    await page.fill('input[name="guestEmail"]', "john@example.com");
    await page.fill(
      'textarea[name="guestNotes"]',
      "Looking forward to our meeting",
    );

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/booking/success");
    await expect(page.getByText("Booking Confirmed!")).toBeVisible();
    await expect(
      page.getByText("Your meeting has been successfully scheduled"),
    ).toBeVisible();
  });

  test("should show not found for non-existent username", async ({ page }) => {
    await page.goto(`/nonexistent${uniqueId()}/meeting`);
    await expectNotFound(page);
  });

  test("should show not found for non-existent event type", async ({
    page,
  }) => {
    await page.goto(`/${testUsername}/nonexistent-event`);
    await expectNotFound(page);
  });
});
