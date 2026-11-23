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
