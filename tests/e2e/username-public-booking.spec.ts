import { expect, test } from "@playwright/test";
import {
  expectNotFound,
  fillRegisterForm,
  generateTestUser,
  register,
  registerAndLogin,
  uniqueId,
} from "./helpers";

test.describe("Username and Public Booking Page", () => {
  test("should configure username and view public booking page", async ({
    page,
  }) => {
    const user = generateTestUser();
    await register(page, user);

    await page.goto(`/book/${user.username}`);

    await expect(page.locator("h1")).toContainText(user.name);
    // The user hasn't created any event types yet
    await expect(page.getByText("No available event types")).toBeVisible();
  });

  test("should show error for duplicate username", async ({ page }) => {
    const first = generateTestUser("User One");
    await register(page, first);

    await fillRegisterForm(page, {
      ...generateTestUser("User Two"),
      username: first.username,
    });

    await expect(page).toHaveURL(/\/register\?error=username/);
  });

  test("should show 404 for non-existent username", async ({ page }) => {
    await page.goto(`/book/nonexistent${uniqueId()}`);
    await expectNotFound(page);
  });

  test("should copy booking link to clipboard", async ({ page, context }) => {
    // Only Chromium supports these permissions
    await context
      .grantPermissions(["clipboard-read", "clipboard-write"])
      .catch(() => {});

    await registerAndLogin(page);
    await page.goto("/dashboard/settings");

    const copyButton = page.getByRole("button", { name: "Copy" }).first();
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(
      page.getByRole("button", { name: "Copied" }).first(),
    ).toBeVisible();
  });

  test("should update username from settings", async ({ page }) => {
    const user = await registerAndLogin(
      page,
      generateTestUser("Username Update Test"),
    );
    const newUsername = `updated${uniqueId()}`;

    await page.goto("/dashboard/settings");
    await page.locator("#username").fill(newUsername);
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(
      page.getByText("Settings updated successfully!"),
    ).toBeVisible();
    await expect(page.locator("code")).toContainText(`/book/${newUsername}`);

    await page.goto(`/book/${newUsername}`);
    await expect(page.locator("h1")).toContainText(user.name);

    await page.goto(`/book/${user.username}`);
    await expectNotFound(page);
  });
});
