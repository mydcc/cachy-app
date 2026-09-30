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
 * BUG-0576 — the Bitget market-data half of the V1 → V2 migration.
 *
 * Every REST shape Cachy sends to Bitget used to live under `/api/mix/v1/…`.
 * Bitget decommissioned that generation: the venue answers
 * `{"code":"30032","msg":"The V1 API has been decommissioned…"}` before it
 * ever looks at a signature, so tickers and every kline were dead.
 *
 * These cases drive the real venue module with a stubbed global `fetch` and
 * assert on the URL that actually leaves the process — the same seam the
 * klines and tickers routes use. A literal in a table is not what a venue
 * call looks like, and a test that only reads the table would stay green
 * while the two literals in `venues/bitget.ts` kept pointing at V1.
 *
 * Every expectation below is pinned against a live, unauthenticated V2
 * response recorded on 2026-09-30, not against the vendor's documentation:
 *
 *   GET /api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES
 *       &granularity=1m&limit=2
 *     -> {"code":"00000","msg":"success","requestTime":…,
 *         "data":[["1790782740000","84128.2","84199.9","84123.8",
 *                  "84192.8","22.4343","1888400.63673"]]}
 *
 *   GET /api/v2/mix/market/ticker?symbol=BTCUSDT   (no productType)
 *     -> {"code":"400172","msg":"Parameter verification failed","data":null}
 *
 *   GET /api/v2/mix/market/candles?symbol=BTCUSDT_UMCBL&productType=USDT-FUTURES
 *     -> {"code":"40034","msg":"Parameter BTCUSDT_UMCBL does not exist"}
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bitgetVenue } from "./bitget";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

/** The URL the venue actually requested, as a parsed `URL`. */
function requestedUrl(call = 0): URL {
  return new URL(fetchMock.mock.calls[call][0] as string);
}

describe("Bitget market data on the V2 API (BUG-0576)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe("candles", () => {
    it("reads candles from the V2 endpoint", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 2,
      });

      expect(requestedUrl().pathname).toBe("/api/v2/mix/market/candles");
    });

    it("names the USDT-M futures product, which V2 requires", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 2,
      });

      expect(requestedUrl().searchParams.get("productType")).toBe("USDT-FUTURES");
    });

    it("sends the bare contract, without the V1 `_UMCBL` suffix", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      // The client hands the venue whatever `normalizeSymbol(…, "bitget")`
      // produced, which is still `BTCUSDT_UMCBL` — so stripping has to happen
      // here, not only by no longer appending.
      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT_UMCBL",
        interval: "1m",
        limit: 2,
      });

      expect(requestedUrl().searchParams.get("symbol")).toBe("BTCUSDT");
    });

    it("passes the caller's limit on, which V2 honours", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 137,
      });

      expect(requestedUrl().searchParams.get("limit")).toBe("137");
    });

    it("caps the limit at the venue's own ceiling", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      // `limit=1000` answers 00000 with 1000 rows; `limit=1001` answers
      // `40053 "Value range verification failed: limit should be between
      // (0, 1000]"`. The route clamps to MAX_KLINE_LIMIT = 1000 too, but that
      // constant is documented as Bitunix's ceiling and Bitunix truncates
      // where Bitget rejects — the two agreeing today is a coincidence, not a
      // contract, so the venue layer clamps against its own.
      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 100000,
      });

      expect(requestedUrl().searchParams.get("limit")).toBe("1000");
    });

    it("omits the limit rather than sending a nonsensical one", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: Number.NaN,
      });

      // Bitget's own default applies, which is what a missing limit means.
      expect(requestedUrl().searchParams.has("limit")).toBe(false);
    });

    it("surfaces the vendor's code and message from a 400 body", async () => {
      // Bitget pairs every business error with a 4xx status *and* a code in the
      // body. Judging the status before reading the envelope — which this used
      // to do — discarded `msg` on every one of them and reduced a precise
      // diagnosis to "Bitget API error: 400".
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            code: "40053",
            msg: "Value range verification failed: limit should be between (0, 1000]",
            data: null,
          }),
      });

      await expect(
        bitgetVenue.fetchKlines({ symbol: "BTCUSDT", interval: "1m", limit: 50 }),
      ).rejects.toThrow("Bitget Error: 40053 Value range verification failed");
    });

    it("falls back to the status when the error body is not JSON", async () => {
      // An upstream that answers an HTML error page must not surface as a parse
      // error — the status is the useful diagnosis there.
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "<html><body>Bad Gateway</body></html>",
      });

      await expect(
        bitgetVenue.fetchKlines({ symbol: "BTCUSDT", interval: "1m", limit: 50 }),
      ).rejects.toThrow("Bitget API error: 502");
    });

    it("keeps translating Cachy intervals onto Bitget's granularity names", async () => {
      fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

      await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 1,
      });

      // V2 rejects the lowercase form with 400171, so `1h` must become `1H`.
      expect(requestedUrl().searchParams.get("granularity")).toBe("1H");
    });

    it("parses the recorded V2 candle tuple into the venue shape", async () => {
      fetchMock.mockResolvedValue(
        okResponse({
          code: "00000",
          msg: "success",
          requestTime: 1790782740000,
          data: [
            ["1790782740000", "84128.2", "84199.9", "84123.8", "84192.8", "22.4343", "1888400.63673"],
          ],
        }),
      );

      const candles = await bitgetVenue.fetchKlines({
        symbol: "BTCUSDT",
        interval: "1m",
        limit: 2,
      });

      expect(candles).toEqual([
        {
          timestamp: 1790782740000,
          open: "84128.2",
          high: "84199.9",
          low: "84123.8",
          close: "84192.8",
          volume: "22.4343",
        },
      ]);
    });
  });

  describe("tickers", () => {
    it("reads a single ticker from the V2 endpoint", () => {
      const url = new URL(bitgetVenue.tickersUrl({ symbols: "BTCUSDT" }));

      expect(url.pathname).toBe("/api/v2/mix/market/ticker");
    });

    it("names the product on a single-symbol request, or V2 answers 400172", () => {
      const url = new URL(bitgetVenue.tickersUrl({ symbols: "BTCUSDT" }));

      expect(url.searchParams.get("productType")).toBe("USDT-FUTURES");
    });

    it("strips `_UMCBL` from a single-symbol request", () => {
      const url = new URL(bitgetVenue.tickersUrl({ symbols: "BTCUSDT_UMCBL" }));

      expect(url.searchParams.get("symbol")).toBe("BTCUSDT");
    });

    it("reads all tickers from the V2 endpoint with the V2 product name", () => {
      const url = new URL(bitgetVenue.tickersUrl({}));

      expect(url.pathname).toBe("/api/v2/mix/market/tickers");
      expect(url.searchParams.get("productType")).toBe("USDT-FUTURES");
    });
  });

  it("never addresses the decommissioned V1 generation on the market-data paths", async () => {
    fetchMock.mockResolvedValue(okResponse({ code: "00000", data: [] }));

    await bitgetVenue.fetchKlines({ symbol: "BTCUSDT", interval: "1m", limit: 1 });
    const allTickers = bitgetVenue.tickersUrl({});
    const oneTicker = bitgetVenue.tickersUrl({ symbols: "BTCUSDT_UMCBL" });

    for (const url of [requestedUrl(), new URL(allTickers), new URL(oneTicker)]) {
      expect(url.pathname).not.toMatch(/^\/api\/mix\/v1\//);
    }
  });
});
