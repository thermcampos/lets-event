// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock } from "../helpers/prisma-mock";

const h = vi.hoisted(() => ({
  captured: { config: undefined as any },
  compare: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    h.captured.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({
  default: (options: Record<string, unknown>) => ({ id: "google", options }),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: Record<string, unknown>) => ({
    id: "credentials",
    options,
  }),
}));
vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({ adapter: true })),
}));
vi.mock("bcryptjs", () => ({
  default: { compare: (...args: unknown[]) => h.compare(...args) },
}));

const prismaMock = createPrismaMock();
vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));

async function loadConfig() {
  vi.resetModules();
  await import("@/auth");
  return h.captured.config;
}

const findProvider = (config: any, id: string) =>
  config.providers.find((p: any) => p.id === id);

describe("auth.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("Google provider", () => {
    it("requests calendar.events scope with offline access and forced consent", async () => {
      const config = await loadConfig();
      const params = findProvider(config, "google").options.authorization
        .params;
      expect(params.scope).toContain(
        "https://www.googleapis.com/auth/calendar.events",
      );
      expect(params.scope).toContain("openid");
      expect(params.access_type).toBe("offline");
      expect(params.prompt).toBe("consent");
    });

    it("reads client credentials from env", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
      const options = findProvider(await loadConfig(), "google").options;
      expect(options.clientId).toBe("cid");
      expect(options.clientSecret).toBe("csecret");
    });

    it("defaults client credentials to empty strings when unset", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const options = findProvider(await loadConfig(), "google").options;
      expect(options.clientId).toBe("");
      expect(options.clientSecret).toBe("");
    });
  });

  describe("config", () => {
    it("uses the prisma adapter and spreads authConfig", async () => {
      const config = await loadConfig();
      expect(config.adapter).toEqual({ adapter: true });
      expect(config.session).toEqual({ strategy: "jwt" });
      expect(config.pages).toEqual({ signIn: "/login" });
    });
  });

  describe("Credentials authorize", () => {
    const dbUser = {
      id: "u1",
      email: "a@b.com",
      name: "Ann",
      image: "img",
      password: "hash",
    };

    async function authorize(credentials: unknown) {
      const config = await loadConfig();
      return findProvider(config, "credentials").options.authorize(credentials);
    }

    it("returns null when credentials are missing", async () => {
      expect(await authorize(undefined)).toBeNull();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("returns null when email or password is empty", async () => {
      expect(await authorize({ email: "", password: "x" })).toBeNull();
      expect(await authorize({ email: "a@b.com" })).toBeNull();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for an unknown user", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      expect(await authorize({ email: "a@b.com", password: "pw" })).toBeNull();
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "a@b.com" },
      });
      expect(h.compare).not.toHaveBeenCalled();
    });

    it("returns null when the user has no password hash (OAuth-only)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...dbUser,
        password: null,
      });
      expect(await authorize({ email: "a@b.com", password: "pw" })).toBeNull();
      expect(h.compare).not.toHaveBeenCalled();
    });

    it("returns null for a wrong password", async () => {
      prismaMock.user.findUnique.mockResolvedValue(dbUser);
      h.compare.mockResolvedValue(false);
      expect(await authorize({ email: "a@b.com", password: "bad" })).toBeNull();
      expect(h.compare).toHaveBeenCalledWith("bad", "hash");
    });

    it("returns the user object without the password hash on success", async () => {
      prismaMock.user.findUnique.mockResolvedValue(dbUser);
      h.compare.mockResolvedValue(true);
      const result = await authorize({ email: "a@b.com", password: "pw" });
      expect(result).toEqual({
        id: "u1",
        email: "a@b.com",
        name: "Ann",
        image: "img",
      });
      expect(result).not.toHaveProperty("password");
    });
  });
});
