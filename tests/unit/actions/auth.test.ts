// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {}
  return {
    AuthError,
    signIn: vi.fn(),
    signOut: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    findFirst: vi.fn(),
    create: vi.fn(),
    hash: vi.fn(),
  };
});

vi.mock("@/auth", () => ({ signIn: mocks.signIn, signOut: mocks.signOut }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next-auth", () => ({ AuthError: mocks.AuthError }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/prisma.server", () => ({
  prisma: { user: { findFirst: mocks.findFirst, create: mocks.create } },
}));

import { loginUser, registerUser, signOutUser } from "@/lib/actions/auth";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hash.mockResolvedValue("hashed");
});

describe("signOutUser", () => {
  it("signs out and returns to the home page", async () => {
    await signOutUser();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});

describe("loginUser", () => {
  const creds = form({ email: "a@x.com", password: "pw" });

  it("signs in with credentials and goes to the dashboard", async () => {
    await expect(loginUser(creds)).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", {
      email: "a@x.com",
      password: "pw",
      redirect: false,
    });
  });

  it("redirects to the invalid-credentials error on an AuthError", async () => {
    mocks.signIn.mockRejectedValue(new mocks.AuthError("bad"));
    await expect(loginUser(creds)).rejects.toThrow(
      "REDIRECT:/login?error=invalid",
    );
  });

  it("rethrows unexpected errors", async () => {
    mocks.signIn.mockRejectedValue(new Error("db down"));
    await expect(loginUser(creds)).rejects.toThrow("db down");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("registerUser", () => {
  const fields = form({
    name: "Ann",
    email: "a@x.com",
    username: "ann",
    password: "pw",
  });

  it("creates the user with a hashed password and redirects to login", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(registerUser(fields)).rejects.toThrow(
      "REDIRECT:/login?success=registered",
    );
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ email: "a@x.com" }, { username: "ann" }] },
    });
    expect(mocks.hash).toHaveBeenCalledWith("pw", 10);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        name: "Ann",
        email: "a@x.com",
        username: "ann",
        password: "hashed",
      },
    });
  });

  it("rejects an existing email", async () => {
    mocks.findFirst.mockResolvedValue({ email: "a@x.com", username: "other" });
    await expect(registerUser(fields)).rejects.toThrow(
      "REDIRECT:/register?error=exists",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects an existing username", async () => {
    mocks.findFirst.mockResolvedValue({ email: "b@x.com", username: "ann" });
    await expect(registerUser(fields)).rejects.toThrow(
      "REDIRECT:/register?error=username",
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
