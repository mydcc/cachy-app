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
import { get } from "svelte/store";
import { Decimal } from "decimal.js";

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

      let data = marketState.data[symbol].klines[tf];
      expect(data.length).toBe(1);
      expect(data[0].close.toNumber()).toBe(50000);

      // 2. REST Update arrives (lagged)
      // REST says close is 49500 (old snapshot)
      // It also brings history (T-1) which we want
      marketState.updateSymbolKlines(symbol, tf, [
        { time: timePrev, open: 48000, high: 49000, low: 48000, close: 49000, volume: 200 },
        { time: timeT, open: 49000, high: 50100, low: 48900, close: 49500, volume: 90 }
      ], "rest");

      data = marketState.data[symbol].klines[tf];

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

      const data = marketState.data[symbol].klines[tf];
      expect(data.length).toBe(1);
      expect(data[0].close.toNumber()).toBe(104);
    });
  });
});
