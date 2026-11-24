# Unit Test Expansion - Implementation Guide

Audience: an engineer or AI agent implementing this phase by phase.
Rules for the implementer: do not run `npm run build` or e2e here; the repo owner runs builds, coverage baselines and e2e. Follow Biome style (2 spaces, double quotes, semicolons).

Current state: `tests/unit/` holds `components/auth-toast.test.tsx`, `lib/password.test.ts` (tautological, to be deleted) and `lib/resend.test.ts`. Vitest 4.x, `happy-dom` default environment, `globals: true`, alias `@` -> `src`. No coverage, no tests for Google Calendar, routes, slots or auth.

## Recommended order

0. Tooling and shared helpers
1. `google-calendar.ts`, then route tests (cancel, reschedule, bookings POST, bookings/[id], respond, propose, week-status, slots, upload/avatar)
2. Pure libs (slots, booking-validation, utils, auth.config, resend extensions)
3. `auth.ts` and `proxy.ts`
4. Coverage thresholds and CI

Each phase should be its own PR. Phase 4 needs the baseline numbers the user produces.

---

## Conventions (apply everywhere)

- Route tests start with `// @vitest-environment node` (the default is `happy-dom`; `Response`/`NextResponse` behave better in node).
- Route params are a Promise: `{ params: Promise.resolve({ id }) }`.
- `NextResponse.redirect` tests assert the `location` header and a 307 status, not a followed page.
- Set the timezone deterministically (see `env.ts` below); use `vi.useFakeTimers()` + `vi.setSystemTime()` for anything time dependent, and `vi.useRealTimers()` in `afterEach`.
- Env: `vi.stubEnv(...)` and `vi.unstubAllEnvs()` in `afterEach`. Never assign `process.env` directly.
- Spy on `console.error` where the code swallows errors (`vi.spyOn(console, "error").mockImplementation(() => {})`), and assert it was called.
- Always mock `@/lib/prisma.server` (it builds a `pg.Pool` at import), `@/lib/resend`, `@/auth` and `@/lib/google-calendar` as the unit under test requires.
- An arrow function used as a mock fails with `new`. The `OAuth2` mock must be a `class` or `function`.
- Assert only load-bearing Prisma `where` shapes (userId/provider, `id: { not }`, status filters). Do not snapshot whole call args.
- `vi.mock` factories are hoisted; share state through `vi.hoisted`.

---

## Phase 0 - Tooling and shared helpers

### 0.1 Install coverage provider (the user runs this)

Match the installed vitest major/minor exactly:

```bash
npm i -D @vitest/coverage-v8@^4.1.12
```

### 0.2 `vitest.config.ts` - coverage WITHOUT thresholds (thresholds come in Phase 4)

Add inside `test`:

```ts
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**",
        "src/app/api/**",
        "src/auth.config.ts",
        "src/auth.ts",
        "src/proxy.ts",
      ],
      exclude: [
        "src/lib/prisma*.ts",
        "**/*.d.ts",
        "src/components/ui/**",
        "src/generated/**",
        "**/generated/**",
      ],
    },
```

Adjust the generated path to wherever Prisma output lives (check `prisma/schema.prisma` `output`). `coverage/` is already in `.gitignore` (line 14 matches `/coverage`).

### 0.3 `package.json` script

The name `test:coverage` / `test` would clash conceptually with Playwright's `test`, so use:

```json
"test:unit:coverage": "vitest run --coverage",
```

### 0.4 Helper files in `tests/unit/helpers/`

#### `env.ts`

```ts
import { afterEach, beforeEach, vi } from "vitest";

/** Call once at the top of a test file. Pins TZ, stubs app env, restores after. */
export function useTestEnv(overrides: Record<string, string> = {}) {
  const prevTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
    vi.stubEnv("NEXTAUTH_URL", "https://app.test");
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
```

For slot/DST tests that need a non-UTC `TZ`, set it in the `test.env` of a dedicated file or via `vi.stubEnv("TZ", ...)` before any `Date` is constructed; pass explicit IANA zones to the code under test instead wherever possible.

#### `googleapis-mock.ts`

Use `vi.hoisted` so the mock is available inside the `vi.mock` factory.

```ts
import { vi } from "vitest";

type TokensListener = (tokens: Record<string, unknown>) => unknown;

export function createGoogleMock() {
  const tokenListeners: TokensListener[] = [];
  const setCredentials = vi.fn();
  const oauth2Ctor = vi.fn();
  const events = { insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const calendarFactory = vi.fn(() => ({ events }));

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
```

Because the listener is `async`, `emitTokens` must await the returned promise so a rejected `prisma.account.update` surfaces to the test.

#### `prisma-mock.ts`

Only mock the models/methods the code under test touches; add more as needed.

```ts
import { vi } from "vitest";

const fn = () => vi.fn();

export function createPrismaMock() {
  const mock = {
    account: { findFirst: fn(), update: fn() },
    booking: {
      findUnique: fn(),
      findFirst: fn(),
      findMany: fn(),
      count: fn(),
      create: fn(),
      update: fn(),
    },
    eventType: { findUnique: fn(), findFirst: fn() },
    user: { findUnique: fn() },
    availability: { findMany: fn() },
    $transaction: fn(),
  };
  // Interactive transactions: run the callback against the same mock as `tx`.
  mock.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(mock),
  );
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
```

Usage in a test file:

```ts
const { prismaMock } = vi.hoisted(() => ({ prismaMock: {} as PrismaMock }));
vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  Object.assign(prismaMock, createPrismaMock());
  return { prisma: prismaMock };
});
```

Simpler alternative that avoids ordering issues: inside `vi.hoisted`, `await import` is not available, so define the object with `vi.fn()` literally in `vi.hoisted` for files that need it, or use the pattern above. Pick one pattern and use it in every file. Also mock `@/lib/prisma` if any module under test imports that path instead.

#### `builders.ts`

```ts
import type { PrismaMock } from "./prisma-mock";

export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "host@example.com",
    name: "Host",
    username: "host",
    timezone: "UTC",
    ...overrides,
  };
}

export function buildEventType(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-type-1",
    userId: "user-1",
    title: "30 Minute Meeting",
    slug: "30min",
    description: "Chat",
    duration: 30,
    minimumNoticeHours: 24,
    maximumNoticeDays: 14,
    maxBookingsPerWeek: null as number | null,
    ...overrides,
  };
}

export function buildBooking(overrides: Record<string, unknown> = {}) {
  const user = buildUser();
  const eventType = buildEventType();
  return {
    id: "booking-1",
    userId: user.id,
    eventTypeId: eventType.id,
    guestName: "Guest",
    guestEmail: "guest@example.com",
    guestNotes: null as string | null,
    startTime: new Date("2026-03-02T10:00:00Z"),
    endTime: new Date("2026-03-02T10:30:00Z"),
    status: "confirmed",
    googleCalendarEventId: null as string | null,
    meetLink: null as string | null,
    user,
    eventType,
    ...overrides,
  };
}

export function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    userId: "user-1",
    provider: "google",
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_at: 1_800_000_000,
    ...overrides,
  };
}

export type { PrismaMock };
```

Verify field names against `prisma/schema.prisma` and the real route code; fix builders if they drift (TypeScript will not catch it because of the loose overrides).

#### `route.ts`

```ts
import { NextRequest } from "next/server";

export function jsonRequest(
  url: string,
  body?: unknown,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return new NextRequest(url, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function getRequest(url: string) {
  return new NextRequest(url, { method: "GET" });
}

export function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}
```

### 0.5 Baseline

The user runs `npm run test:unit:coverage` on the Phase 0 PR and records the numbers. Do not run it yourself.

**Acceptance (Phase 0):**
- [ ] `@vitest/coverage-v8` in devDependencies, same version line as `vitest`.
- [ ] Coverage block present, no `thresholds`.
- [ ] `test:unit:coverage` script present; `test` and `test:unit` unchanged.
- [ ] Five helper files exist and typecheck (`npm run typecheck` by the user).
- [ ] Baseline numbers posted in the PR by the user.

---

## Phase 1 - `src/lib/google-calendar.ts`

### Test file skeleton: `tests/unit/lib/google-calendar.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAccount } from "../helpers/builders";
import { useTestEnv } from "../helpers/env";
import { createGoogleMock } from "../helpers/googleapis-mock";
import { createPrismaMock } from "../helpers/prisma-mock";

const { g, prismaMock } = vi.hoisted(() => ({
  g: {} as ReturnType<typeof import("../helpers/googleapis-mock").createGoogleMock>,
  prismaMock: {} as ReturnType<typeof import("../helpers/prisma-mock").createPrismaMock>,
}));

vi.mock("googleapis", async () => {
  const { createGoogleMock } = await import("../helpers/googleapis-mock");
  Object.assign(g, createGoogleMock());
  return { google: g.google };
});
vi.mock("@/lib/prisma.server", async () => {
  const { createPrismaMock } = await import("../helpers/prisma-mock");
  Object.assign(prismaMock, createPrismaMock());
  return { prisma: prismaMock };
});

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarClient,
  isGoogleCalendarConnected,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";

useTestEnv();

describe("google-calendar", () => {
  beforeEach(() => {
    g.reset();
    vi.clearAllMocks();
    prismaMock.account.findFirst.mockResolvedValue(buildAccount());
  });
  afterEach(() => vi.useRealTimers());

  describe("getGoogleCalendarClient", () => {
    it("throws when there is no account", async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);
      await expect(getGoogleCalendarClient("user-1")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("throws when access_token is null", async () => {
      prismaMock.account.findFirst.mockResolvedValue(
        buildAccount({ access_token: null }),
      );
      await expect(getGoogleCalendarClient("user-1")).rejects.toThrow(
        "Google Calendar not connected",
      );
    });

    it("queries by userId and provider google, builds client from env", async () => {
      await getGoogleCalendarClient("user-1");
      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", provider: "google" },
      });
      expect(g.oauth2Ctor).toHaveBeenCalledWith("client-id", "client-secret");
      expect(g.setCredentials).toHaveBeenCalledWith({
        access_token: "access-1",
        refresh_token: "refresh-1",
      });
      expect(g.calendarFactory).toHaveBeenCalledWith(
        expect.objectContaining({ version: "v3" }),
      );
    });
  });

  describe("token refresh listener", () => {
    it("persists access + refresh token and expires_at in seconds", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expiry_date: 1_900_000_123_456,
      });
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_at: 1_900_000_123,
        },
      });
    });

    it("omits refresh_token when Google only returns an access token", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({ access_token: "a2", expiry_date: 1_900_000_000_000 });
      const arg = prismaMock.account.update.mock.calls[0][0];
      expect(arg.data).toEqual({ access_token: "a2", expires_at: 1_900_000_000 });
      expect(arg.data).not.toHaveProperty("refresh_token");
    });

    it("does nothing when no tokens are present", async () => {
      await getGoogleCalendarClient("user-1");
      await g.emitTokens({});
      expect(prismaMock.account.update).not.toHaveBeenCalled();
    });

    it("characterization: a failing update rejects the listener (no try/catch)", async () => {
      prismaMock.account.update.mockRejectedValue(new Error("db down"));
      await getGoogleCalendarClient("user-1");
      await expect(g.emitTokens({ access_token: "a3" })).rejects.toThrow("db down");
    });
  });

  describe("createGoogleCalendarEvent", () => {
    const event = {
      summary: "Intro call",
      description: "Chat",
      startTime: new Date("2026-03-02T10:00:00Z"),
      endTime: new Date("2026-03-02T10:30:00Z"),
      attendees: ["guest@example.com"],
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
      g.events.insert.mockResolvedValue({
        data: { id: "ge-1", hangoutLink: "https://meet/x", htmlLink: "https://cal/x" },
      });
    });

    it("sends the exact insert payload and returns ids/links", async () => {
      const result = await createGoogleCalendarEvent("user-1", {
        ...event,
        bookingId: "b-1",
      });
      expect(g.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        conferenceDataVersion: 1,
        sendUpdates: "all",
        requestBody: {
          summary: "Intro call",
          description: [
            "Chat",
            "",
            "---",
            "Cancel this booking: https://app.test/api/bookings/b-1/cancel",
            "Reschedule this booking: https://app.test/booking/reschedule/b-1",
          ]
            .filter(Boolean)
            .join("\n"),
          start: { dateTime: "2026-03-02T10:00:00.000Z" },
          end: { dateTime: "2026-03-02T10:30:00.000Z" },
          attendees: [{ email: "guest@example.com" }],
          conferenceData: {
            createRequest: {
              requestId: `user-1-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: "email", minutes: 60 },
              { method: "popup", minutes: 30 },
            ],
          },
        },
      });
      expect(result).toEqual({
        eventId: "ge-1",
        meetLink: "https://meet/x",
        htmlLink: "https://cal/x",
      });
    });

    it("omits cancel/reschedule lines without bookingId", async () => {
      await createGoogleCalendarEvent("user-1", event);
      const desc = g.events.insert.mock.calls[0][0].requestBody.description;
      expect(desc).toBe("Chat\n---");
    });

    it("falls back to localhost when NEXTAUTH_URL is unset", async () => {
      vi.stubEnv("NEXTAUTH_URL", "");
      await createGoogleCalendarEvent("user-1", { ...event, bookingId: "b-1" });
      const desc = g.events.insert.mock.calls[0][0].requestBody.description;
      expect(desc).toContain("http://localhost:3000/api/bookings/b-1/cancel");
    });
  });

  describe("token-refresh simulation", () => {
    it("refresh happens during an API call, is persisted, and the call succeeds", async () => {
      // Google client refreshes tokens mid-request and emits "tokens".
      g.events.insert.mockImplementation(async () => {
        await g.emitTokens({ access_token: "fresh", expiry_date: 1_900_000_000_000 });
        return { data: { id: "ge-2", hangoutLink: null, htmlLink: "h" } };
      });
      const result = await createGoogleCalendarEvent("user-1", {
        summary: "s",
        startTime: new Date("2026-03-02T10:00:00Z"),
        endTime: new Date("2026-03-02T10:30:00Z"),
        attendees: [],
      });
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { access_token: "fresh", expires_at: 1_900_000_000 },
      });
      expect(result.eventId).toBe("ge-2");
    });
  });
});
```

The `useTestEnv()` call registers `beforeEach`/`afterEach` hooks at module scope; that is fine in Vitest. `vi.stubEnv("NEXTAUTH_URL", "")` yields an empty string, which is falsy, so the `||` fallback applies.

### Remaining cases to cover (same file)

- `updateGoogleCalendarEvent`: only provided fields end up in `requestBody` (empty updates -> `{}`); `patch` called with `calendarId: "primary"`, `eventId`, `sendUpdates: "all"`; returns `{eventId, meetLink, htmlLink}`; attendees mapped to `{email}`.
- `deleteGoogleCalendarEvent`: `delete` args; resolves to undefined.
- `isGoogleCalendarConnected`: true with token, false for no account, false for null token.
- Error simulations: `insert`/`patch`/`delete` rejecting with 401, 403, 404, 410, `{ message: "invalid_grant" }` and a network error each propagate unchanged (`rejects.toBe(error)`). This pins current behavior; do not add handling.

### Optional: `tests/unit/lib/google-calendar.sim.test.ts`

A stateful fake: an in-memory `events` Map backing `insert/patch/delete` (404/410 for unknown ids after delete), plus a fake `prisma.account` object whose `update` mutates it. Scenarios:

1. create -> reschedule (patch) -> cancel (delete); Map ends empty.
2. Expired token: the fake Google emits `tokens` before the first call; account row is updated, then the call succeeds.
3. Revoked access: calls reject with `invalid_grant`; error propagates and no account update occurs.

### Route tests (in this order)

Directory: `tests/unit/api/bookings/...`. All use `// @vitest-environment node`.

#### Worked example: reschedule (`tests/unit/api/bookings/reschedule.test.ts`)

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBooking, buildEventType } from "../../helpers/builders";
import { useTestEnv } from "../../helpers/env";
import { jsonRequest, params } from "../../helpers/route";

const { prismaMock, getClient, sendEmail, patch } = vi.hoisted(() => {
  const patch = vi.fn();
  return {
    patch,
    getClient: vi.fn(),
    sendEmail: vi.fn(),
    prismaMock: {
      booking: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    },
  };
});

vi.mock("@/lib/prisma.server", () => ({ prisma: prismaMock }));
vi.mock("@/lib/google-calendar", () => ({ getGoogleCalendarClient: getClient }));
vi.mock("@/lib/resend", () => ({ sendBookingRescheduledEmail: sendEmail }));

import { POST } from "@/app/api/bookings/[id]/reschedule/route";

useTestEnv();

const body = {
  startTime: "2026-03-10T10:00:00.000Z",
  endTime: "2026-03-10T10:30:00.000Z",
};
const call = (b: unknown = body) =>
  POST(
    jsonRequest("https://app.test/api/bookings/booking-1/reschedule", b),
    params({ id: "booking-1" }),
  );

describe("POST /api/bookings/[id]/reschedule", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getClient.mockResolvedValue({ events: { patch } });
    sendEmail.mockResolvedValue(undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it("400 when times are missing", async () => {
    const res = await call({ startTime: body.startTime });
    expect(res.status).toBe(400);
  });

  it("404 when booking does not exist", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("400 when booking is cancelled", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ status: "cancelled" }),
    );
    expect((await call()).status).toBe(400);
  });

  it("400 when weekly limit reached (UTC week, excludes this booking)", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ eventType: buildEventType({ maxBookingsPerWeek: 2 }) }),
    );
    prismaMock.booking.count.mockResolvedValue(2);
    const res = await call();
    expect(res.status).toBe(400);
    const where = prismaMock.booking.count.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "booking-1" });
    // 2026-03-10 is a Tuesday: UTC week is Sun 03-08 .. Sun 03-15
    expect(where.startTime.gte.toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(where.startTime.lt.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("without a Google event: updates booking, emails, redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    const res = await call();
    expect(getClient).not.toHaveBeenCalled();
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(res.headers.get("location")).toBe(
      "https://app.test/booking/rescheduled/booking-1",
    );
  });

  it("with a Google event: patches it and stores the returned meetLink", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1", meetLink: "old" }),
    );
    patch.mockResolvedValue({ data: { hangoutLink: "https://meet/new" } });
    await call();
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: "primary", eventId: "ge-1", sendUpdates: "all" }),
    );
    expect(prismaMock.booking.update.mock.calls[0][0].data.meetLink).toBe(
      "https://meet/new",
    );
  });

  it("500 path: Google failure aborts before booking.update and email", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(
      buildBooking({ googleCalendarEventId: "ge-1" }),
    );
    patch.mockRejectedValue(new Error("410 gone"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update calendar event" });
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("email failure is swallowed and still redirects", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    sendEmail.mockRejectedValue(new Error("resend down"));
    const res = await call();
    expect(res.headers.get("location")).toContain("/booking/rescheduled/");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("characterization: no conflict, notice or end>start validation", async () => {
    prismaMock.booking.findUnique.mockResolvedValue(buildBooking());
    const res = await call({
      startTime: "2020-01-01T10:00:00.000Z", // in the past
      endTime: "2020-01-01T09:00:00.000Z", // before start
    });
    expect(res.status).toBe(307);
    expect(prismaMock.booking.update).toHaveBeenCalledOnce();
  });
});
```

#### Cancel (`cancel.test.ts`)

`src/app/api/bookings/[id]/cancel/route.ts` exports `POST` and (verify) `GET` sharing `cancelBooking`. Cases:

- 404 missing; 400 `Booking already cancelled`.
- No `googleCalendarEventId`: `getGoogleCalendarClient` not called; booking updated to `{ status: "cancelled" }`.
- With event id: `events.delete` called with `{ calendarId: "primary", eventId, sendUpdates: "all" }`.
- Google failure: `console.error` called, booking still cancelled, redirect to `https://app.test/booking/cancelled/:id`.
- Email failure swallowed, still redirects.
- GET and POST give identical outcomes (parameterize with `it.each`).
- Unexpected prisma throw -> 500 `Failed to cancel booking`.

#### Bookings POST (`bookings-post.test.ts`, `src/app/api/bookings/route.ts`)

Read the route first and fix field names. Cases: 400s for missing fields/invalid input; 404 event type; notice boundaries with fake timers (exactly `minimumNoticeHours` is allowed because `isBefore` is strict; one ms earlier is rejected; same for `maximumNoticeDays`); 409 conflict; `maxBookingsPerWeek` reached; Google not connected -> 201 with no `meetLink` (`createGoogleCalendarEvent` rejects `"Google Calendar not connected"` or `isGoogleCalendarConnected` false, per the route); connected success -> `booking.update` with `googleCalendarEventId`/`meetLink` and email including `meetLink`; `createGoogleCalendarEvent` throws -> 201 plus exactly one fallback email; characterization: `booking.update` throws after insert -> Google event orphaned and email sent without `meetLink`; unexpected errors -> 500.

#### `bookings/[id]` PATCH/GET, then `respond`

PATCH status transitions (incl. cancel with Google delete) and GET lookup. For `respond`, mock `$transaction` as `fn => fn(tx)` (default in `createPrismaMock`) and cover the CONFLICT path (transaction callback throws/returns the conflict marker the route uses; read the route).

#### Then `propose`, `week-status`, `slots`, `upload/avatar`

Same pattern. For avatar upload, `vi.mock("@vercel/blob", () => ({ put: vi.fn() }))`, mock `@/auth`, and test unauthenticated, bad file type/size, success.

**Acceptance (Phase 1):**
- [ ] Every exported function in `google-calendar.ts` has at least one test; all branches in the listener covered.
- [ ] Payload assertions are exact for `insert`; `Date.now()` pinned with fake timers.
- [ ] Error simulations (401/403/404/410/invalid_grant/network) propagate unchanged.
- [ ] Each route test file covers every status code the route can return.
- [ ] No test hits a real DB, network, Resend or Google.
- [ ] `console.error` is spied wherever it is expected, and the spy is restored.
- [ ] Characterization tests are named `characterization: ...` so they are easy to find and flip later.

---

## Phase 2 - Pure libs

- `lib/slots.ts`: fake timers pinned "now"; cases for min/max notice windows, existing bookings excluded (cancelled ignored), `maxBookingsPerWeek`, multiple ranges per day, and a non-UTC user timezone including a DST transition day (e.g. `America/New_York` 2026-03-08 and 2026-11-01). Assert slot start ISO strings.
- `lib/booking-validation.ts`: counts only `confirmed` bookings (pin this; note the route uses `not: "cancelled"`).
- `lib/utils.ts`: `cn` merging/conflict resolution.
- `auth.config.ts`: `session` callback sets `user.id` from `token.sub`; `jwt` callback copies `account.access_token`/`refresh_token` into the token and `user.id` into `sub`. Add a test pinning that session currently exposes `accessToken` and `refreshToken` (characterization; see suspected bugs). Import `authConfig.callbacks` and call directly with minimal objects.
- `resend.test.ts`: extend with `sendProposalReceivedEmail`, `sendProposalApprovedEmail`, `sendProposalDeclinedEmail`, `sendBookingCompletedGuestEmail` using the existing `mockSend` pattern (assert `from`, `to`, subject, key content).
- Delete `tests/unit/lib/password.test.ts` (tautological).

**Acceptance (Phase 2):**
- [ ] Each lib listed has a test file; slots has a DST case in both directions.
- [ ] `password.test.ts` removed; nothing else references it.
- [ ] Resend: all exported senders covered.

---

## Phase 3 - `auth.ts` and `proxy.ts`

- `auth.ts`: `vi.mock("next-auth", ...)` so `NextAuth(config)` captures `config` and returns stub `{ handlers, auth, signIn, signOut }`; also mock `next-auth/providers/*` or let the real provider factories run and inspect the result. Assert: Google provider scope contains `calendar.events`, `access_type: "offline"`, `prompt: "consent"`. Credentials `authorize`: missing credentials -> null; unknown user -> null; wrong password -> null; correct password -> user object. Mock `@/lib/prisma.server` and `bcrypt`-style compare (check which library `auth.ts` uses).
- `proxy.ts`: mock `next-auth/jwt` `getToken` (or `@/auth`, whichever it uses). Cases: unauthenticated dashboard -> redirect to `/login`; authenticated `/login` or `/register` -> redirect `/dashboard`; public routes pass through.

**Acceptance:** each branch listed above covered; no real secrets required (`vi.stubEnv("AUTH_SECRET", "test")` if needed).

---

## Phase 4 - Thresholds, script, CI

### 4.1 Thresholds (after the user supplies Phase 1-3 coverage numbers)

Set each value to measured minus 2-3 points. Starting targets:

```ts
    coverage: {
      // ...existing keys from Phase 0...
      thresholds: {
        lines: 70,
        branches: 60,
        "src/lib/google-calendar.ts": { lines: 95, branches: 90, functions: 100 },
        "src/lib/slots.ts": { lines: 90 },
        "src/lib/booking-validation.ts": { lines: 90 },
        "src/lib/utils.ts": { lines: 90 },
        "src/app/api/bookings/**": { lines: 85, branches: 75 },
        "src/auth.config.ts": { lines: 100 },
        "src/auth.ts": { lines: 80 },
        "src/proxy.ts": { lines: 80 },
      },
    },
```

Vitest 4 treats non-numeric keys as glob patterns; if a glob in the installed version needs a different shape, check the Vitest docs for `coverage.thresholds`. Never lower a threshold to land a PR without a note.

### 4.2 CI diff (`.github/workflows/ci.yml`)

```diff
       - name: Install dependencies
-        run: npm i
+        run: npm ci
@@
-      - name: Run unit tests
-        run: npm run test:unit
+      - name: Run unit tests with coverage
+        run: npm run test:unit:coverage
+
+      - name: Upload coverage report
+        if: always()
+        uses: actions/upload-artifact@v4
+        with:
+          name: coverage
+          path: coverage/
+          if-no-files-found: ignore
+
+      - name: Coverage summary
+        if: always()
+        run: |
+          if [ -f coverage/coverage-summary.json ]; then
+            node -e 'const t=require("./coverage/coverage-summary.json").total;console.log("## Unit coverage\n\n| Metric | % |\n|---|---|\n"+["lines","branches","functions","statements"].map(k=>`| ${k} | ${t[k].pct} |`).join("\n"))' >> "$GITHUB_STEP_SUMMARY"
+          fi
```

Notes:
- `npm ci` requires `package-lock.json` in sync; the user should run `npm i` locally once and commit the lock file if it fails.
- The workflow already defines `RESEND_APIKEY` at top level. Add dummy env vars (e.g. `DATABASE_URL`) only if a test run fails because of a missing variable; prefer stubbing in tests.
- Pin the `upload-artifact` version to whatever major the repo's other actions track (they use recent majors such as `checkout@v7`).
- `coverage/` is already git-ignored.

**Acceptance (Phase 4):**
- [ ] Thresholds in config equal measured-minus-2-3, per glob.
- [ ] CI fails when a threshold is violated (user verifies on a throwaway branch).
- [ ] Coverage artifact uploaded even on failure.
- [ ] `npm ci` works in CI.

---

## Optional refactors (separate PR, after tests are green)

Behavior-preserving only; tests from Phase 1 must pass unchanged.

- Make cancel, PATCH-cancel and reschedule call `deleteGoogleCalendarEvent` / `updateGoogleCalendarEvent` (currently dead code; routes call `calendar.events.*` directly). Adjust route test mocks from the `events` client to those functions.
- Extract `buildBookingDescription` (cancel/reschedule URL block is duplicated three times).

## Suspected bugs found while planning

Unverified by tests. Each requires user approval to fix; write a `characterization:` test first, then flip it with the fix in a separate PR.

1. Token listener has no try/catch: a failed `prisma.account.update` rejects inside an event handler (unhandled rejection).
2. Session exposes `accessToken` and `refreshToken` to the client (`auth.config.ts`).
3. Google `events.delete` 404/410 is treated as failure/logged rather than success (already-deleted event).
4. `GET /api/bookings` appears to be unauthenticated and returns all bookings with `include: user`, which may leak the password hash and guest PII. Verify first.
5. Cancel is state-changing on GET with an unsigned booking id (link prefetchers or anyone with the id can cancel).
6. Reschedule lacks conflict, minimum-notice and end>start checks, and uses a UTC week while other code uses the local week.
7. Conference `requestId` is `${userId}-${Date.now()}`, which can collide within one millisecond; use `randomUUID()`.
8. `validateBooking` counts `confirmed` only while the routes use `status: { not: "cancelled" }`; inconsistent.
9. If `booking.update` fails after Google insert, the Google event is orphaned (and the guest gets an email without a meet link).
