// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";

// Callbacks are typed against next-auth's full objects; call with minimal shapes.
const session = authConfig.callbacks.session as (args: any) => Promise<any>;
const jwt = authConfig.callbacks.jwt as (args: any) => Promise<any>;

describe("authConfig", () => {
  it("uses jwt sessions and /login as sign-in page", () => {
    expect(authConfig.session.strategy).toBe("jwt");
    expect(authConfig.pages.signIn).toBe("/login");
  });

  describe("session callback", () => {
    it("sets user.id from token.sub", async () => {
      const result = await session({
        session: { user: { name: "A" } },
        token: { sub: "user-42" },
      });
      expect(result.user.id).toBe("user-42");
    });

    it("leaves the session untouched when there is no session.user", async () => {
      const result = await session({
        session: {},
        token: { sub: "user-42", accessToken: "x" },
      });
      expect(result).toEqual({});
    });

    it("characterization: exposes accessToken and refreshToken on the session", async () => {
      const result = await session({
        session: { user: {} },
        token: { sub: "u", accessToken: "access-1", refreshToken: "refresh-1" },
      });
      expect(result.accessToken).toBe("access-1");
      expect(result.refreshToken).toBe("refresh-1");
    });
  });

  describe("jwt callback", () => {
    it("copies account tokens into the token on sign-in", async () => {
      const token = await jwt({
        token: {},
        account: { access_token: "a", refresh_token: "r" },
      });
      expect(token.accessToken).toBe("a");
      expect(token.refreshToken).toBe("r");
    });

    it("copies user.id into sub", async () => {
      const token = await jwt({ token: { sub: "old" }, user: { id: "new" } });
      expect(token.sub).toBe("new");
    });

    it("leaves the token unchanged on later calls (no account/user)", async () => {
      const token = await jwt({
        token: { sub: "u", accessToken: "a", refreshToken: "r" },
      });
      expect(token).toEqual({ sub: "u", accessToken: "a", refreshToken: "r" });
    });
  });
});
