// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchMessage, type DispatchContext } from "./channelDispatch";
import { marketState } from "../../stores/market.svelte";

vi.mock("../../stores/market.svelte", () => ({
  marketState: {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    updateKline: vi.fn(),
  },
}));

vi.mock("../../stores/account.svelte", () => ({
  accountState: {
    updatePositionFromWs: vi.fn(),
    updateOrderFromWs: vi.fn(),
    updateBalanceFromWs: vi.fn(),
  },
}));

vi.mock("../omsService", () => ({
  omsService: { updatePosition: vi.fn(), updateOrder: vi.fn() },
}));

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

function makeContext(): DispatchContext {
  return {
    commitThrottle: vi.fn(),
    safeString: (val) => (val === undefined ? undefined : String(val)),
    shouldThrottle: () => false,
    tradeListeners: new Map(),
    syntheticSubs: new Map(),
  };
}

describe("dispatchMessage fast_kline (BUG-0248)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives candle open time from message-level ts when data lacks a timestamp", () => {
    const ts = 1775541412718; // from the Bitunix WS docs kline push example
    const ctx = makeContext();
    dispatchMessage(
      {
        type: "fast_kline",
        symbol: "BTCUSDT",
        timeframe: "1h",
        rawSymbol: "BTCUSDT",
        ts,
        data: { o: "68581.4", h: "68590", l: "68579.5", c: "68583.4", b: "5.2395", q: "359348.14078" },
      },
      ctx
    );

    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(1);
    const [symbol, timeframe, klines, source] = vi.mocked(marketState.updateSymbolKlines).mock.calls[0] as [
      string,
      string,
      { time: number }[],
      string,
    ];
    expect(symbol).toBe("BTCUSDT");
    expect(timeframe).toBe("1h");
    expect(source).toBe("ws");
    // 1775541412718 aligned down to the 1h boundary (3600000 ms).
    expect(klines[0].time).toBe(Math.floor(ts / 3600000) * 3600000);
    expect(Number.isNaN(klines[0].time)).toBe(false);
  });

  it("keeps a timestamp that data already provides", () => {
    const ctx = makeContext();
    const knownTime = 1775541000000;
    dispatchMessage(
      {
        type: "fast_kline",
        symbol: "BTCUSDT",
        timeframe: "1h",
        rawSymbol: "BTCUSDT",
        ts: 1775541412718,
        data: { time: knownTime, o: "68581.4", h: "68590", l: "68579.5", c: "68583.4", b: "5.2395", q: "359348.14078" },
      },
      ctx
    );

    const klines = vi.mocked(marketState.updateSymbolKlines).mock.calls[0]?.[2] as { time: number }[];
    expect(klines[0].time).toBe(knownTime);
  });

  it("validated market_kline branch also derives the candle time from ts", () => {
    const ts = 1775541412718;
    const ctx = makeContext();
    dispatchMessage(
      {
        type: "validated",
        message: {
          ch: "market_kline_60min",
          symbol: "BTCUSDT",
          ts,
          data: { o: "68581.4", h: "68590", l: "68579.5", c: "68583.4", b: "5.2395", q: "359348.14078" },
        },
      },
      ctx
    );

    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(1);
    const [symbol, timeframe, klines, source] = vi.mocked(marketState.updateSymbolKlines).mock.calls[0] as [
      string,
      string,
      { time: number }[],
      string,
    ];
    expect(symbol).toBe("BTCUSDT");
    expect(timeframe).toBe("1h");
    expect(source).toBe("ws");
    expect(klines[0].time).toBe(Math.floor(ts / 3600000) * 3600000);
    expect(Number.isNaN(klines[0].time)).toBe(false);
  });
});