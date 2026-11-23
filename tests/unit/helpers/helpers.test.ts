import { describe, expect, it, vi } from "vitest";
import { buildBooking, buildEventType } from "./builders";
import { createGoogleMock } from "./googleapis-mock";
import { createPrismaMock } from "./prisma-mock";
import { getRequest, jsonRequest, params } from "./route";

describe("createGoogleMock", () => {
  it("builds a constructible OAuth2 and emits tokens to listeners", async () => {
    const g = createGoogleMock();
    const client = new g.google.auth.OAuth2("id", "secret");
    const listener = vi.fn();
    client.on("tokens", listener);
    client.setCredentials({ access_token: "a" });

    await g.emitTokens({ access_token: "b" });

    expect(g.oauth2Ctor).toHaveBeenCalledWith("id", "secret");
    expect(g.setCredentials).toHaveBeenCalledWith({ access_token: "a" });
    expect(listener).toHaveBeenCalledWith({ access_token: "b" });
    expect(g.google.calendar({ version: "v3" }).events).toBe(g.events);
  });

  it("reset clears calls and listeners", async () => {
    const g = createGoogleMock();
    new g.google.auth.OAuth2().on("tokens", vi.fn());
    g.events.insert("x");
    g.reset();
    expect(g.tokenListeners).toHaveLength(0);
    expect(g.events.insert).not.toHaveBeenCalled();
  });
});

describe("createPrismaMock", () => {
  it("runs interactive transactions against the same mock", async () => {
    const prisma = createPrismaMock();
    const result = await prisma.$transaction(async (tx: unknown) => tx);
    expect(result).toBe(prisma);
  });
});

describe("builders", () => {
  it("apply overrides", () => {
    expect(buildEventType({ duration: 60 }).duration).toBe(60);
    const booking = buildBooking({ status: "cancelled" });
    expect(booking.status).toBe("cancelled");
    expect(booking.user.id).toBe(booking.userId);
  });
});

describe("route helpers", () => {
  it("jsonRequest sends a JSON body and getRequest a GET", async () => {
    const post = jsonRequest("https://app.test/x", { a: 1 });
    expect(post.method).toBe("POST");
    expect(await post.json()).toEqual({ a: 1 });
    expect(getRequest("https://app.test/x").method).toBe("GET");
  });

  it("params resolves to the given object", async () => {
    await expect(params({ id: "1" }).params).resolves.toEqual({ id: "1" });
  });
});
