import { expect, type Page, test } from "@playwright/test";
import { registerAndLogin, uniqueId } from "./helpers";

type EventTypeInput = {
  title: string;
  duration: string;
  description?: string;
  maxBookingsPerWeek?: string;
  minimumNoticeHours?: string;
  maximumNoticeDays?: string;
};

async function createEventType(page: Page, input: EventTypeInput) {
  await page.goto("/dashboard/event-types/new");
  await page.locator("#title").fill(input.title);
  await page.locator("#slug").fill(`event-${uniqueId()}`);
  if (input.description) {
    await page.locator("#description").fill(input.description);
  }
  await page.locator("#duration").fill(input.duration);
  if (input.maxBookingsPerWeek) {
    await page.locator("#maxBookingsPerWeek").fill(input.maxBookingsPerWeek);
  }
  if (input.minimumNoticeHours) {
    await page.locator("#minimumNoticeHours").fill(input.minimumNoticeHours);
  }
  if (input.maximumNoticeDays) {
    await page.locator("#maximumNoticeDays").fill(input.maximumNoticeDays);
  }

  // Use the role: the nav's sign-out button is also a submit button
  await page.getByRole("button", { name: "Create Event Type" }).click();
  await expect(page).toHaveURL("/dashboard/event-types");
}

/** The Card for a given event type on the list page. */
function eventTypeCard(page: Page, title: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
  });
}

test.describe("Event Type Constraints", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test("should create event type with booking constraints", async ({
    page,
  }) => {
    await createEventType(page, {
      title: "Limited Consultation",
      description: "Consultation with booking limits",
      duration: "60",
      maxBookingsPerWeek: "3",
      minimumNoticeHours: "48",
      maximumNoticeDays: "7",
    });

    const card = eventTypeCard(page, "Limited Consultation");
    await expect(card).toBeVisible();
    await expect(card.getByText("Max 3/week")).toBeVisible();
    await expect(card.getByText("48h notice")).toBeVisible();
    await expect(card.getByText("7 days max")).toBeVisible();
  });

  test("should edit event type constraints", async ({ page }) => {
    await createEventType(page, { title: "Test Event", duration: "30" });

    await eventTypeCard(page, "Test Event")
      .getByRole("link", { name: "Edit" })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/event-types\/.+\/edit/);

    await page.locator("#maxBookingsPerWeek").fill("5");
    await page.locator("#minimumNoticeHours").fill("24");
    await page.locator("#maximumNoticeDays").fill("14");

    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL("/dashboard/event-types");

    const card = eventTypeCard(page, "Test Event");
    await expect(card.getByText("Max 5/week")).toBeVisible();
    // 24h is the default so no notice badge is shown
    await expect(card.getByText(/\d+h notice/)).toHaveCount(0);
    await expect(card.getByText("14 days max")).toBeVisible();
  });

  test("should display unlimited when no max bookings set", async ({
    page,
  }) => {
    await createEventType(page, { title: "Unlimited Event", duration: "30" });

    const card = eventTypeCard(page, "Unlimited Event");
    await expect(card).toBeVisible();
    await expect(card.getByText(/Max \d+\/week/)).toHaveCount(0);
  });

  test("should show constraints in edit form", async ({ page }) => {
    await createEventType(page, {
      title: "Constrained Event",
      duration: "45",
      maxBookingsPerWeek: "2",
      minimumNoticeHours: "72",
      maximumNoticeDays: "10",
    });

    await eventTypeCard(page, "Constrained Event")
      .getByRole("link", { name: "Edit" })
      .click();

    await expect(page.locator("#maxBookingsPerWeek")).toHaveValue("2");
    await expect(page.locator("#minimumNoticeHours")).toHaveValue("72");
    await expect(page.locator("#maximumNoticeDays")).toHaveValue("10");
  });
});
