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
import { tpSlState } from "../../stores/tpsl.svelte";

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

vi.mock("../../stores/tpsl.svelte", () => ({
  tpSlState: { updateFromWs: vi.fn() },
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

describe("dispatchMessage synthetic kline fan-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const base1mPush = (ts: number) =>
    ({
      type: "fast_kline",
      symbol: "BTCUSDT",
      timeframe: "1m",
      rawSymbol: "BTCUSDT",
      ts,
      data: { o: "100", h: "102", l: "99", c: "101", b: "1", q: "2" },
    }) as const;

  it("fans a 1m push out to an active synthetic 3m subscription", () => {
    const ctx = makeContext();
    ctx.syntheticSubs.set("BTCUSDT:3m", 1);

    dispatchMessage(base1mPush(1775541000000), ctx);

    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(2);
    const [synthSymbol, synthTimeframe, synthKlines] = vi.mocked(marketState.updateSymbolKlines).mock
      .calls[1] as [string, string, { time: number; open: number }[], string];
    expect(synthSymbol).toBe("BTCUSDT");
    expect(synthTimeframe).toBe("3m");
    // 1775541000000 is exactly on a 3m boundary.
    expect(synthKlines[0].time).toBe(Math.floor(1775541000000 / 180000) * 180000);
    expect(Number(synthKlines[0].close)).toBe(101);
  });

  it("does not fan out when no synthetic subscription exists", () => {
    const ctx = makeContext();
    dispatchMessage(base1mPush(1775541000000), ctx);
    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(1);
  });

  it("does not fan out when the synthetic base differs from the pushed timeframe", () => {
    // 2h derives from the 1h feed — a 1m push must not touch it.
    const ctx = makeContext();
    ctx.syntheticSubs.set("BTCUSDT:2h", 1);

    dispatchMessage(base1mPush(1775541000000), ctx);

    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(1);
  });

  it("fans a validated market_kline_60min push out to a synthetic 2h subscription", () => {
    const ctx = makeContext();
    ctx.syntheticSubs.set("BTCUSDT:2h", 1);
    const ts = 1775541412718;

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
      ctx,
    );

    expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(2);
    const [synthSymbol, synthTimeframe] = vi.mocked(marketState.updateSymbolKlines).mock.calls[1] as [
      string,
      string,
    ];
    expect(synthSymbol).toBe("BTCUSDT");
    expect(synthTimeframe).toBe("2h");
  });
});

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

describe("dispatchMessage tp_sl channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards a single push to tpSlState.updateFromWs", () => {
    const ctx = makeContext();

    dispatchMessage(
      {
        type: "validated",
        message: {
          ch: "tp_sl",
          data: { event: "CREATE", orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "93" },
        },
      },
      ctx,
    );

    expect(tpSlState.updateFromWs).toHaveBeenCalledTimes(1);
    expect(tpSlState.updateFromWs).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "42", symbol: "SOLUSDT", tpPrice: "93" }),
    );
  });

  it("forwards each item of an array push individually", () => {
    const ctx = makeContext();

    dispatchMessage(
      {
        type: "validated",
        message: {
          ch: "tp_sl",
          data: [
            { orderId: "42", symbol: "SOLUSDT", tpPrice: "93" },
            { orderId: "42", symbol: "SOLUSDT", slPrice: "85" },
          ],
        },
      },
      ctx,
    );

    expect(tpSlState.updateFromWs).toHaveBeenCalledTimes(2);
  });
});