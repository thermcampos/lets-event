import { expect, test } from "@playwright/test";
import {
  fillRegisterForm,
  generateTestUser,
  login,
  register,
  registerAndLogin,
} from "./helpers";

test.describe("Authentication Flow", () => {
  test("should display landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toContainText("Simple Scheduling");
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(
      page.getByRole("navigation").getByRole("button", { name: "Sign In" }),
    ).toBeVisible();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Get Started" }).click();

    await expect(page).toHaveURL("/register");
    // CardTitle is a div, not a heading - use text locator
    await expect(
      page.locator('[data-slot="card-title"]', { hasText: "Create Account" }),
    ).toBeVisible();
  });

  test("should register a new user and redirect to login", async ({ page }) => {
    await register(page, generateTestUser());
  });

  test("should not allow duplicate email registration", async ({ page }) => {
    const user = generateTestUser();
    await register(page, user);

    // Same email, different username
    await fillRegisterForm(page, {
      ...generateTestUser("Another User"),
      email: user.email,
    });

    await expect(page).toHaveURL(/\/register\?error=exists/);
  });

  test("should login with valid credentials", async ({ page }) => {
    const user = await registerAndLogin(page);

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("should not login with invalid password", async ({ page }) => {
    const user = generateTestUser();
    await register(page, user);

    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/login\?error=invalid/);
  });

  test("should not login with non-existent email", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill("nonexistent@example.com");
    await page.locator("#password").fill("anypassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/login\?error=invalid/);
  });

  test("should logout successfully", async ({ page }) => {
    await registerAndLogin(page);

    // The sign-out button is the only form button in the top navigation
    await page.locator("nav form button[type='submit']").first().click();

    await expect(page).toHaveURL("/");
  });

  test("should protect dashboard route when not logged in", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL("/login");
  });

  test("should redirect logged-in users from login page to dashboard", async ({
    page,
  }) => {
    const user = generateTestUser();
    await register(page, user);
    await login(page, user);

    await page.goto("/login");

    await expect(page).toHaveURL("/dashboard");
  });
});
