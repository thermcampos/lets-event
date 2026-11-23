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
  mock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mock),
  );
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;
