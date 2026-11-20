import { expect, type Page, test } from "@playwright/test";
import { generateTestUser, registerAndLogin } from "./helpers";

async function addAvailability(
  page: Page,
  day: string,
  startTime: string,
  endTime: string,
) {
  await page.selectOption("#dayOfWeek", day);
  await page.fill("#startTime", startTime);
  await page.fill("#endTime", endTime);
  await page.getByRole("button", { name: "Add Availability" }).click();
  // The server action re-renders the same URL, so wait for the new slot itself
  await expect(page.getByText(`${startTime} - ${endTime}`)).toBeVisible();
}

test.describe("Availability Management", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, generateTestUser("Availability Test User"));
  });

  test("should navigate to availability page from dashboard", async ({
    page,
  }) => {
    // Click on availability link
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Availability" })
      .first()
      .click();

    // Verify we're on the availability page
    await expect(page).toHaveURL("/dashboard/availability");
    await expect(page.locator("h1")).toContainText("Availability");
  });

  test("should show empty state when no availability is set", async ({
    page,
  }) => {
    await page.goto("/dashboard/availability");

    // Check empty state message
    await expect(page.getByText("No availability set yet")).toBeVisible();
  });

  test("should add new availability slot", async ({ page }) => {
    await page.goto("/dashboard/availability");
    await addAvailability(page, "1", "09:00", "17:00"); // Monday
    await expect(page.getByText("No availability set yet")).toHaveCount(0);
  });

  test("should add multiple availability slots", async ({ page }) => {
    await page.goto("/dashboard/availability");

    await addAvailability(page, "1", "09:00", "12:00"); // Monday
    await addAvailability(page, "3", "14:00", "18:00"); // Wednesday

    await expect(page.getByText("09:00 - 12:00")).toBeVisible();
    await expect(page.getByText("14:00 - 18:00")).toBeVisible();
  });

  test("should delete availability slot", async ({ page }) => {
    await page.goto("/dashboard/availability");
    await addAvailability(page, "2", "10:00", "16:00"); // Tuesday

    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("No availability set yet")).toBeVisible();
    await expect(page.getByText("10:00 - 16:00")).toHaveCount(0);
  });

  test("should navigate back to dashboard", async ({ page }) => {
    await page.goto("/dashboard/availability");

    // Click Dashboard nav link
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Dashboard" })
      .first()
      .click();

    // Verify we're on dashboard
    await expect(page).toHaveURL("/dashboard");
  });

  test("should require authentication to access availability page", async ({
    page,
    context,
  }) => {
    // Clear cookies to logout
    await context.clearCookies();

    // Try to access availability page
    await page.goto("/dashboard/availability");

    // Should redirect to login
    await expect(page).toHaveURL("/login");
  });

  test("should validate time inputs are required", async ({ page }) => {
    await page.goto("/dashboard/availability");

    // Try to submit without times
    await page.selectOption('select[name="dayOfWeek"]', "1");

    // Check that submit button is present but form validation prevents submission
    const submitButton = page.locator(
      'button[type="submit"]:has-text("Add Availability")',
    );
    await expect(submitButton).toBeVisible();

    // The browser's built-in validation should prevent submission
    // We can verify the required attributes exist
    await expect(page.locator('input[name="startTime"]')).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.locator('input[name="endTime"]')).toHaveAttribute(
      "required",
      "",
    );
  });

  test("should show all days of the week in dropdown", async ({ page }) => {
    await page.goto("/dashboard/availability");

    const select = page.locator('select[name="dayOfWeek"]');

    // Verify all days are present by checking option count
    const options = await select.locator("option").all();
    expect(options.length).toBe(7);

    // Verify specific days exist
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    for (const day of days) {
      const option = select.locator(`option:has-text("${day}")`);
      await expect(option).toHaveCount(1);
    }
  });

  test("should persist availability across sessions", async ({ page }) => {
    await page.goto("/dashboard/availability");

    await addAvailability(page, "5", "08:00", "12:00"); // Friday

    // Reload page
    await page.reload();

    // Verify it's still there
    await expect(page.getByText("08:00 - 12:00")).toBeVisible();
  });
});
