import { vi } from "vitest";

type TokensListener = (tokens: Record<string, unknown>) => unknown;

export function createGoogleMock() {
  const tokenListeners: TokensListener[] = [];
  const setCredentials = vi.fn();
  const oauth2Ctor = vi.fn();
  const events = { insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const calendarFactory = vi.fn((_options?: unknown) => ({ events }));

  class OAuth2 {
    constructor(...args: unknown[]) {
      oauth2Ctor(...args);
    }
    setCredentials = setCredentials;
    on(event: string, listener: TokensListener) {
      if (event === "tokens") tokenListeners.push(listener);
      return this;
    }
  }

  const google = { auth: { OAuth2 }, calendar: calendarFactory };

  return {
    google,
    oauth2Ctor,
    setCredentials,
    calendarFactory,
    events,
    tokenListeners,
    async emitTokens(tokens: Record<string, unknown>) {
      await Promise.all(tokenListeners.map((l) => l(tokens)));
    },
    reset() {
      tokenListeners.length = 0;
      for (const fn of [
        setCredentials,
        oauth2Ctor,
        calendarFactory,
        events.insert,
        events.patch,
        events.delete,
      ]) {
        fn.mockClear();
      }
    },
  };
}
