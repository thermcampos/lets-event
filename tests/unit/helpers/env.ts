import { afterEach, beforeEach, vi } from "vitest";

/** Call once at the top of a test file. Pins TZ, stubs app env, restores after. */
export function useTestEnv(overrides: Record<string, string> = {}) {
  const prevTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    for (const [key, value] of Object.entries(overrides)) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });
}
