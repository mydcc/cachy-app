// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock browser environment before importing the store
vi.mock("$app/environment", () => ({
  browser: true,
  dev: true
}));

// Import after mock
import { MarketManager } from "./market.svelte";

describe("marketStore", () => {
  let marketState: MarketManager;

  beforeEach(() => {
    vi.useFakeTimers();
    marketState = new MarketManager();
  });

  afterEach(() => {
    marketState.destroy();
    vi.useRealTimers();
  });

  it("should have updateTicker function", () => {
    expect(typeof marketState.updateTicker).toBe("function");
  });

  it("should update ticker data correctly", async () => {
    marketState.updateTicker("BTCUSDT", {
      lastPrice: "52000",
      high: "53000",
      low: "49000",
      vol: "1000",
      quoteVol: "52000000",
      change: "0.04",
      open: "50000",
    });

    // Wait for flush interval (250ms)
    await vi.advanceTimersByTimeAsync(300);

    const data = marketState.data["BTCUSDT"];

    expect(data).toBeDefined();
    expect(data.lastPrice?.toNumber()).toBe(52000);
    expect(data.highPrice?.toNumber()).toBe(53000);
    expect(data.lowPrice?.toNumber()).toBe(49000);
    expect(data.volume?.toNumber()).toBe(1000);
    expect(data.quoteVolume?.toNumber()).toBe(52000000);
    expect(data.priceChangePercent?.toNumber()).toBe(4);
  });

  describe("updateSymbol - funding rate", () => {
    it("stores fundingRate, nextFundingTime, and fundingInterval as given (REST is the source of truth)", async () => {
      marketState.updateSymbol("BTCUSDT", {
        fundingRate: "0.0005",
        nextFundingTime: "1770710400000",
        fundingInterval: 8,
      });
      await vi.advanceTimersByTimeAsync(300);

      const data = marketState.data["BTCUSDT"];
      expect(data.fundingRate?.toString()).toBe("0.0005");
      expect(data.nextFundingTime).toBe(1770710400000);
      expect(data.fundingInterval).toBe(8);
    });

    it("accepts a variable fundingInterval per symbol (not fixed at 8h)", async () => {
      marketState.updateSymbol("XRPUSDT", { fundingInterval: 6 });
      await vi.advanceTimersByTimeAsync(300);
      expect(marketState.data["XRPUSDT"].fundingInterval).toBe(6);
    });
  });

  describe("updateSymbol - mark price (BUG-0055)", () => {
    it("stores markPrice from a partial update, defaulting to null when never set", async () => {
      const symbol = "BTCUSDT";
      expect(marketState.data[symbol]).toBeUndefined();

      marketState.updateSymbol(symbol, { indexPrice: "50001" });
      await vi.advanceTimersByTimeAsync(300);
      // Position display must be able to tell "never received" (null) apart
      // from "received a real value" — the account store's own Position type
      // instead falls back to Decimal(0) for a missing field, which is
      // exactly the "0 -> 0" defect this field exists to avoid repeating.
      expect(marketState.data[symbol].markPrice).toBeNull();

      marketState.updateSymbol(symbol, { markPrice: "50002" });
      await vi.advanceTimersByTimeAsync(300);
      expect(marketState.data[symbol].markPrice?.toString()).toBe("50002");
    });

    it("does not let a later push omitting markPrice erase one buffered earlier in the same flush window (BUG-0065)", async () => {
      const symbol = "BTCUSDT";

      // Two WS pushes land inside the same 250ms flush window (throttle is
      // 200ms, flush is 250ms — this is the normal case, not an edge case):
      // one with a real markPrice, one that only carries indexPrice because
      // that's the only field Bitunix's push happened to include this tick.
      // Callers build partials like `{ markPrice: mp ? new Decimal(mp) :
      // undefined }`, so the second push still has an explicit
      // `markPrice: undefined` key.
      marketState.updateSymbol(symbol, { markPrice: "50002", indexPrice: "50001" });
      marketState.updateSymbol(symbol, { indexPrice: "50003", markPrice: undefined });

      await vi.advanceTimersByTimeAsync(300);

      // The real markPrice from the first push must survive the flush —
      // not get clobbered by the second push's `undefined` before either
      // ever reaches `current`.
      expect(marketState.data[symbol].markPrice?.toString()).toBe("50002");
      expect(marketState.data[symbol].indexPrice?.toString()).toBe("50003");
    });
  });

  describe("Kline Protection (Single Source of Truth)", () => {
    it("should prioritize WS updates over REST for the live candle", async () => {
      const symbol = "BTCUSDT";
      const tf = "1h";
      const timeT = 1700000000000;
      const timePrev = 1700000000000 - 3600000;

      // 1. Initial State: WS provides live candle T
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timeT, open: 49000, high: 50100, low: 48900, close: 50000, volume: 100 }
      ], "ws");

      // 2. REST Update arrives (lagged)
      // REST says close is 49500 (old snapshot)
      // It also brings history (T-1) which we want
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timePrev, open: 48000, high: 49000, low: 48000, close: 49000, volume: 200 },
        { time: timeT, open: 49000, high: 50100, low: 48900, close: 49500, volume: 90 }
      ], "rest");

      // Flush buffers (WS update should now apply on top of REST)
      await vi.advanceTimersByTimeAsync(300);

      const data = marketState.data[symbol].klines[tf];

      expect(data.length).toBe(2);

      const candlePrev = data.find(k => k.time === timePrev);
      const candleT = data.find(k => k.time === timeT);

      expect(candlePrev).toBeDefined();
      expect(candlePrev?.close.toNumber()).toBe(49000);

      expect(candleT).toBeDefined();
      expect(candleT?.close.toNumber()).toBe(50000); // Should stick to WS value
    });

    it("should allow REST to populate empty history", async () => {
      const symbol = "ETHUSDT";
      const tf = "1h";
      const timeT = 1700000000000;

      // REST comes first (e.g. initial load)
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timeT, open: 3000, high: 3100, low: 2900, close: 3050, volume: 500 }
      ], "rest");

      const data = marketState.data[symbol].klines[tf];
      expect(data.length).toBe(1);
      expect(data[0].close.toNumber()).toBe(3050);
    });

    it("should allow WS to overwrite REST", async () => {
      const symbol = "SOLUSDT";
      const tf = "1h";
      const timeT = 1700000000000;

      // REST first
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timeT, open: 100, high: 105, low: 95, close: 101, volume: 1000 }
      ], "rest");

      // WS update comes later with newer price
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timeT, open: 100, high: 106, low: 95, close: 104, volume: 1050 }
      ], "ws");

      // Wait for buffer flush
      await vi.advanceTimersByTimeAsync(300);

      const data = marketState.data[symbol].klines[tf];
      expect(data.length).toBe(1);
      expect(data[0].close.toNumber()).toBe(104);
    });
  });
});
