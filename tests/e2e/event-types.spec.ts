import { expect, test } from "@playwright/test";
import { registerAndLogin, uniqueId } from "./helpers";

test.describe("Event Types Management", () => {
  test("should create and view event type", async ({ page }) => {
    await registerAndLogin(page);

    await page.goto("/dashboard/event-types");
    await expect(page.locator("h1")).toContainText("Event Types");

    await page.goto("/dashboard/event-types/new");
    await expect(page.locator("h1")).toContainText("Create Event Type");

    await page.locator("#title").fill("30 Minute Meeting");
    await page.locator("#slug").fill(`30min-${uniqueId()}`);
    await page.locator("#description").fill("A quick 30-minute meeting");
    await page.locator("#duration").fill("30");

    await page.getByRole("button", { name: "Create Event Type" }).click();

    await expect(page).toHaveURL("/dashboard/event-types");
    await expect(
      page.locator('[data-slot="card-title"]', {
        hasText: "30 Minute Meeting",
      }),
    ).toBeVisible();
    await expect(page.getByText("30 minutes")).toBeVisible();
  });
});
