import { expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma.server";

export type TestUser = {
  name: string;
  email: string;
  username: string;
  password: string;
};

/** Short random suffix so data never collides across parallel workers/browsers. */
export function uniqueId(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTestUser(name = "Test User"): TestUser {
  const id = uniqueId();
  return {
    name,
    email: `test-${id}@example.com`,
    username: `user${id}`,
    password: "Test123456!",
  };
}

/** Fill and submit the registration form (ids avoid the Name/Username label clash). */
export async function fillRegisterForm(page: Page, user: TestUser) {
  await page.goto("/register");
  await page.locator("#name").fill(user.name);
  await page.locator("#email").fill(user.email);
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Create Account" }).click();
}

export async function register(page: Page, user: TestUser) {
  await fillRegisterForm(page, user);
  await expect(page).toHaveURL(/\/login/);
}

export async function login(
  page: Page,
  user: Pick<TestUser, "email" | "password">,
) {
  if (!page.url().includes("/login")) {
    await page.goto("/login");
  }
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL("/dashboard");
}

export async function registerAndLogin(page: Page, user = generateTestUser()) {
  await register(page, user);
  await login(page, user);
  return user;
}

/** Create a user directly in the database (faster than the UI, for setup only). */
export async function createDbUser(name = "Test User") {
  const user = generateTestUser(name);
  const created = await prisma.user.create({
    data: {
      name: user.name,
      email: user.email,
      username: user.username,
      password: await bcrypt.hash(user.password, 10),
    },
  });
  return { ...user, id: created.id };
}

export async function deleteDbUser(userId: string | undefined) {
  if (!userId) return;
  await prisma.booking.deleteMany({ where: { userId } });
  await prisma.eventType.deleteMany({ where: { userId } });
  await prisma.availability.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

/** Next.js default not-found page. Status is 200 because the root loading.tsx streams first. */
export async function expectNotFound(page: Page) {
  await expect(
    page.getByRole("heading", { name: "This page could not be found." }),
  ).toBeVisible();
}
