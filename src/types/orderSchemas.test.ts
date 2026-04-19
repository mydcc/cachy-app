/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { PlaceOrderSchema, ClosePositionSchema } from "./orderSchemas";

describe("orderSchemas: numeric transforms", () => {
  const base = {
    type: "place-order" as const,
    exchange: "bitunix" as const,
    symbol: "PEPEUSDT",
    side: "BUY",
    orderType: "LIMIT" as const,
  };

  it("preserves low-precision decimals without scientific notation (string input)", () => {
    const parsed = PlaceOrderSchema.parse({
      ...base,
      qty: "1000000",
      price: "0.0000001",
    });
    expect(parsed.price).toBe("0.0000001");
    // Must not serialize to "1e-7" — Bitunix/Bitget gateways reject scientific notation
    expect(parsed.price).not.toMatch(/e-?\d/i);
  });

  it("preserves low-precision decimals without scientific notation (number input)", () => {
    const parsed = PlaceOrderSchema.parse({
      ...base,
      qty: "1000000",
      price: 1e-7,
    });
    expect(parsed.price).toBe("0.0000001");
    expect(parsed.price).not.toMatch(/e-?\d/i);
  });

  it("keeps whole numbers without artificial trailing zeros", () => {
    const parsed = PlaceOrderSchema.parse({
      ...base,
      qty: 100,
      price: "25000",
    });
    expect(parsed.qty).toBe("100");
    expect(parsed.price).toBe("25000");
  });

  it("preserves regular decimals exactly", () => {
    const parsed = PlaceOrderSchema.parse({
      ...base,
      qty: "1.5",
      price: "25000.75",
    });
    expect(parsed.qty).toBe("1.5");
    expect(parsed.price).toBe("25000.75");
  });

  it("rejects zero and negative qty on PositiveNumericString", () => {
    expect(() =>
      PlaceOrderSchema.parse({ ...base, qty: "0", price: "1" }),
    ).toThrow();
    expect(() =>
      PlaceOrderSchema.parse({ ...base, qty: "-5", price: "1" }),
    ).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() =>
      PlaceOrderSchema.parse({ ...base, qty: "abc", price: "1" }),
    ).toThrow();
  });

  it("handles very small values below 1e-20 without scientific notation", () => {
    const parsed = ClosePositionSchema.parse({
      type: "close-position",
      exchange: "bitunix",
      symbol: "PEPEUSDT",
      side: "SELL",
      amount: "0.00000000000000000001",
    });
    expect(parsed.amount).toBe("0.00000000000000000001");
    expect(parsed.amount).not.toMatch(/e-?\d/i);
  });
});
