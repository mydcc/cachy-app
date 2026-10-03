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

/**
 * BUG-0576 — Bitget ticker field names after the V1 → V2 move.
 *
 * The server hands Bitget's upstream payload to the browser unparsed
 * (`routes/api/tickers` returns `data` verbatim), so the venue's field names
 * are this layer's problem. V2 renamed three of them, and the V1 spellings are
 * simply absent from a V2 row:
 *
 *   last          → lastPr
 *   volume24h     → baseVolume
 *   priceChangePercent → no counterpart; `change24h` is a *fraction*
 *
 * Reading the old names does not throw — `new Decimal(undefined || 0)` is a
 * clean zero. The failure mode is a market picker showing 24h change of 0%
 * and volume of 0 for every contract, with nothing in the logs.
 *
 * The row below is a real `market/ticker` response captured from
 * `api.bitget.com` on 2026-09-30, not a hand-written fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMarketSnapshot, fetchTicker24h } from "./marketData";

/** Verbatim from GET /api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES */
const LIVE_V2_TICKER_ROW = {
  symbol: "BTCUSDT",
  lastPr: "84345.7",
  askPr: "84346.5",
  bidPr: "84345.6",
  bidSz: "1.325",
  askSz: "0.874",
  high24h: "85630.7",
  low24h: "82894.9",
  ts: "1790785500000",
  change24h: "0.01309",
  baseVolume: "42162.9315",
  quoteVolume: "3544482485.89267",
  usdtVolume: "3544482485.89267",
  openUtc: "83195.4",
  changeUtc24h: "0.01386",
  indexPrice: "84345.6",
  fundingRate: "0.0001",
  holdingAmount: "7000.5",
  open24h: "83256.2",
  markPrice: "84347.1",
};

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function envelope(rows: unknown[]) {
  return {
    ok: true,
    status: 200,
    // `safeJson` reads `content-type` and refuses anything that is not JSON,
    // and treats a missing `content-length` as "fall back to measuring the body".
    headers: {
      get: (name: string) =>
        name === "content-type" ? "application/json" : null,
    },
    text: async () =>
      JSON.stringify({
        code: "00000",
        msg: "success",
        requestTime: 1790785500000,
        data: rows,
      }),
  };
}

describe("Bitget ticker mapping on V2 field names (BUG-0576)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("reads the last price off `lastPr`, not the V1 `last`", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    expect(ticker.lastPrice.toString()).toBe("84345.7");
  });

  it("reads base volume off `baseVolume`, not the V1 `volume24h`", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    expect(ticker.volume.toString()).toBe("42162.9315");
  });

  it("keeps high and low, which V2 did not rename", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    expect(ticker.highPrice.toString()).toBe("85630.7");
    expect(ticker.lowPrice.toString()).toBe("82894.9");
  });

  it("reports the 24h change as a percentage, not V2's fraction", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    // (84345.7 - 83256.2) / 83256.2 = 1.3086…%. V2's `change24h` reads
    // 0.01309 for the same move, so a direct mapping would be 100x too small
    // and every contract would look flat.
    expect(ticker.priceChangePercent.toNumber()).toBeCloseTo(1.3086, 3);
    expect(ticker.priceChangePercent.toNumber()).toBeGreaterThan(1);
  });

  it("still surfaces markPrice (BUG-0512)", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    expect(ticker.markPrice?.toString()).toBe("84347.1");
  });

  it("keys a single ticker on the canonical bare contract", async () => {
    // BUG-0599: the key used to be `BTCUSDT_UMCBL`. `normalizeSymbol` no longer
    // appends the V1 suffix, so the ticker, the store and the wire now all agree
    // on the bare pair — which is also the only form V2 accepts.
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const ticker = await fetchTicker24h("BTCUSDT", "bitget");

    expect(ticker.symbol).toBe("BTCUSDT");
  });

  it("keys a snapshot row on the bare contract the symbol picker indexes with", async () => {
    fetchMock.mockResolvedValue(envelope([LIVE_V2_TICKER_ROW]));

    const snapshot = await fetchMarketSnapshot("bitget");

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].symbol).toBe("BTCUSDT");
    expect(snapshot[0].lastPrice.toString()).toBe("84345.7");
    expect(snapshot[0].quoteVolume?.toString()).toBe("3544482485.89267");
  });

  it("does not collapse a whole snapshot to zeros", async () => {
    fetchMock.mockResolvedValue(
      envelope([LIVE_V2_TICKER_ROW, { ...LIVE_V2_TICKER_ROW, symbol: "ETHUSDT" }]),
    );

    const snapshot = await fetchMarketSnapshot("bitget");

    for (const row of snapshot) {
      expect(row.lastPrice.isZero()).toBe(false);
      expect(row.volume.isZero()).toBe(false);
    }
  });
});
