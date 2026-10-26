/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { parseMessage } from "./messageParser";

const context = { shouldThrottle: () => false };

describe("parseMessage prototype-key guard (BUG-0725)", () => {
  it("rejects a fast-path ticker carrying __proto__ before dispatch", () => {
    const message = JSON.parse(
      '{"ch":"ticker","symbol":"BTCUSDT","data":{"lastPrice":"1","__proto__":{"polluted":true}}}',
    );

    expect(parseMessage(message, context)).toMatchObject({
      type: "ignore",
      reason: "unsafe_json",
    });
  });

  it("still takes the fast path for a clean ticker", () => {
    const message = {
      ch: "ticker",
      symbol: "BTCUSDT",
      data: {
        lastPrice: "1",
        high: "2",
        low: "0.5",
        volume: "10",
        quoteVolume: "20",
      },
    };

    expect(parseMessage(message, context).type).toBe("fast_ticker");
  });
});
