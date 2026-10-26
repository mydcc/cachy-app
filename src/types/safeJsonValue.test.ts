/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { BitunixWSMessageSchema } from "./bitunixValidation";
import { BitgetWSMessageSchema } from "./bitgetValidation";
import { SafeJsonValueSchema } from "./safeJsonValue";

describe("SafeJsonValueSchema", () => {
  it("accepts a normal nested payload", () => {
    const parsed = SafeJsonValueSchema.safeParse({
      price: "65000.5",
      depth: { bids: [["1", "2"]], asks: [] },
      ok: true,
      nothing: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects __proto__ at the top level", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(SafeJsonValueSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects constructor and prototype at any depth", () => {
    const viaConstructor = JSON.parse('{"a":{"constructor":{"prototype":{}}}}');
    const viaArray = JSON.parse('[{"prototype":{}}]');

    expect(SafeJsonValueSchema.safeParse(viaConstructor).success).toBe(false);
    expect(SafeJsonValueSchema.safeParse(viaArray).success).toBe(false);
  });

  it("refuses deeply nested input without overflowing the stack", () => {
    const deep = JSON.parse("[".repeat(5_000) + "]".repeat(5_000));

    expect(() => SafeJsonValueSchema.safeParse(deep)).not.toThrow();
    expect(SafeJsonValueSchema.safeParse(deep).success).toBe(false);
  });

  it("refuses a non-plain object such as a Date or Blob", () => {
    expect(SafeJsonValueSchema.safeParse(new Date()).success).toBe(false);
    expect(SafeJsonValueSchema.safeParse(new Blob(["x"])).success).toBe(false);
  });
});

describe("WebSocket schemas reject prototype-shaped data", () => {
  it("rejects a Bitunix message whose data carries __proto__", () => {
    const message = JSON.parse(
      '{"ch":"ticker","symbol":"BTCUSDT","data":{"__proto__":{"polluted":true}}}',
    );

    expect(BitunixWSMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects a Bitget message whose data array carries constructor", () => {
    const message = JSON.parse(
      '{"action":"snapshot","arg":{"channel":"ticker","instId":"BTCUSDT"},"data":[{"constructor":{"prototype":{}}}]}',
    );

    expect(BitgetWSMessageSchema.safeParse(message).success).toBe(false);
  });

  it("keeps accepting a normal Bitunix data object", () => {
    const message = {
      ch: "ticker",
      symbol: "BTCUSDT",
      data: { lastPrice: "65000", high: "66000" },
    };

    expect(BitunixWSMessageSchema.safeParse(message).success).toBe(true);
  });
});
