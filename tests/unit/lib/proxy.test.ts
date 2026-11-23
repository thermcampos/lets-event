// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.hoisted(() => vi.fn());
vi.mock("next-auth/jwt", () => ({ getToken }));

import proxy, { config } from "@/proxy";

const req = (path: string) => new NextRequest(`https://app.test${path}`);
const isNext = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("unauthenticated", () => {
    beforeEach(() => getToken.mockResolvedValue(null));

    it.each([
      "/dashboard",
      "/dashboard/bookings",
    ])("redirects %s to /login", async (path) => {
      const res = await proxy(req(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://app.test/login");
    });

    it.each([
      "/login",
      "/register",
      "/",
      "/book/alice",
      "/booking/success",
    ])("lets %s through", async (path) => {
      const res = await proxy(req(path));
      expect(isNext(res)).toBe(true);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("authenticated", () => {
    beforeEach(() => getToken.mockResolvedValue({ sub: "u1" }));

    it.each([
      "/login",
      "/register",
    ])("redirects %s to /dashboard", async (path) => {
      const res = await proxy(req(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://app.test/dashboard");
    });

    it.each([
      "/dashboard",
      "/dashboard/settings",
      "/book/alice",
    ])("lets %s through", async (path) => {
      const res = await proxy(req(path));
      expect(isNext(res)).toBe(true);
    });
  });

  describe("getToken options", () => {
    it("passes AUTH_SECRET and secureCookie=false outside production", async () => {
      vi.stubEnv("AUTH_SECRET", "test");
      vi.stubEnv("NODE_ENV", "test");
      getToken.mockResolvedValue(null);
      await proxy(req("/"));
      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({ secret: "test", secureCookie: false }),
      );
    });

    it("uses secureCookie=true in production", async () => {
      vi.stubEnv("AUTH_SECRET", "test");
      vi.stubEnv("NODE_ENV", "production");
      getToken.mockResolvedValue(null);
      await proxy(req("/"));
      expect(getToken).toHaveBeenCalledWith(
        expect.objectContaining({ secureCookie: true }),
      );
    });
  });

  it("matcher excludes api and static assets", () => {
    expect(config.matcher[0]).toContain("api");
    expect(config.matcher[0]).toContain("_next/static");
  });
});
