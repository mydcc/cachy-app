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
 * Venue market-data fetchers, extracted from apiService.ts (FEAT-0342).
 * Stateless: all venue access goes through requestManager; the public
 * surface stays `apiService` in ../apiService.ts for backward compatibility.
 */

import { Decimal } from "decimal.js";
import { getBitunixErrorKey } from "../../utils/errorUtils";
import { parseTimestamp } from "../../utils/utils";
import { normalizeSymbol as normalizeSymbolUtil } from "../../utils/symbolUtils";
import { logger } from "../logger";
import { isNetworkLoggingEnabled } from "./telemetry";
import { safeJsonParse } from "../../utils/safeJson";
import type { Kline, Ticker24h, FundingRateEntry, FundingRateHistoryItem } from "./marketTypes";
import { ApiStatusError } from "./apiErrors";
import {
  BitunixTickerResponseSchema,
  BitunixFundingRateBatchResponseSchema,
  BitunixFundingRateHistoryResponseSchema,
  BitunixKlineSchema,
  BitgetKlineSchema,
  validateResponseSize,
  sanitizeErrorMessage,
} from "../../types/apiSchemas";
import { requestManager } from "./requestManager";


// Raw Bitget kline shape when the endpoint returns objects instead of
// tuples — field names vary by endpoint version, hence the fallback chains.
interface BitgetRawKlineObject {
  timestamp?: string | number;
  time?: string | number;
  t?: string | number;
  ts?: string | number;
  open?: string | number;
  o?: string | number;
  high?: string | number;
  h?: string | number;
  low?: string | number;
  l?: string | number;
  close?: string | number;
  c?: string | number;
  volume?: string | number;
  vol?: string | number;
  v?: string | number;
}

interface BitunixRawTicker {
  symbol: string;
  open?: string | number;
  lastPrice?: string | number;
  high?: string | number;
  low?: string | number;
  baseVol?: string | number;
  quoteVol?: string | number;
}

interface BitgetRawTicker {
  instId?: string;
  symbol?: string;
  last?: string | number;
  high24h?: string | number;
  low24h?: string | number;
  volume24h?: string | number;
  quoteVolume?: string | number;
  usdtVolume?: string | number;
  priceChangePercent?: string | number;
}

/**
 * Hard cap on rows Bitunix returns per kline request. The API accepts any
 * `limit` and silently truncates, so this -- not the requested limit -- is the
 * real ceiling. Confirmed against the live proxy log: `requested 1000 ... Got 200`.
 */
const BITUNIX_MAX_ROWS_PER_REQUEST = 200;

/**
 * Ceiling on sequential pages per kline request.
 *
 * A synthetic timeframe with a large multiplier can demand absurd base-candle
 * counts -- 600 twelve-minute candles is 7200 one-minute candles, 36 pages. The
 * cap keeps a single request from monopolising its concurrency slot. 20 pages
 * (4000 base candles) still clears EMA 200 for every timeframe the UI offers:
 * 3m needs 9 pages, 6m 18, 10m 6, and 12m lands at ~333 target candles.
 *
 * When the cap binds, we log it. A truncated fetch that reports full success is
 * how the original defect stayed invisible for so long.
 */
const MAX_KLINE_PAGES = 20;

export function normalizeSymbol(symbol: string, provider: "bitunix" | "bitget" | string): string {
    return normalizeSymbolUtil(symbol, provider);
}

export async function safeJson(response: Response, maxSizeMB: number = 10) {
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
        const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
            logger.error("network", `[API] Response too large based on headers: ${Math.round(sizeMB * 100) / 100}MB`);
            throw new Error("apiErrors.responseTooLarge");
        }
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      // Sanitize error message (max 100 chars, no sensitive data)
      const sanitized = sanitizeErrorMessage(text, 100);
      logger.error("network", "[API] Expected JSON, got", sanitized);
      throw new Error("apiErrors.invalidResponseFormat");
    }

    const text = await response.text();

    // Validate size (fallback if content-length is missing)
    if (!validateResponseSize(text, maxSizeMB)) {
      throw new Error("apiErrors.responseTooLarge");
    }

    try {
      return safeJsonParse(text);
    } catch (e) {
      logger.error("network", "[API] JSON parse error");
      throw new Error("apiErrors.invalidJson", { cause: e });
    }
}

export async function fetchBitunixPrice(
    symbol: string,
    priority: "high" | "normal" = "high",
    timeout = 5000,
  ): Promise<Decimal> {
    if (!symbol || symbol.length < 3)
      throw new Error("apiErrors.symbolNotFound");
    const key = `BITUNIX:PRICE:${symbol}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = normalizeSymbol(symbol, "bitunix");
          const params = new URLSearchParams({
            provider: "bitunix",
            symbols: normalized,
          });
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });
          if (response.status === 404) {
            throw new ApiStatusError("apiErrors.symbolNotFound", 404);
          }
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const res = await safeJson(response);

          // Validate response structure with Zod
          const validation = BitunixTickerResponseSchema.safeParse(res);
          if (!validation.success) {
            logger.error(
              "network",
              "[API] Invalid ticker response",
              validation.error.issues,
            );
            throw new Error("apiErrors.invalidResponse");
          }

          const validatedRes = validation.data;

          if (validatedRes.code !== undefined && validatedRes.code !== 0) {
            const is404 = validatedRes.code === 2 || validatedRes.code === "2";
            throw new ApiStatusError(getBitunixErrorKey(validatedRes.code), is404 ? 404 : undefined);
          }
          if (!validatedRes.data || validatedRes.data.length === 0) {
            throw new ApiStatusError("apiErrors.invalidResponse", 404);
          }
          const data = validatedRes.data[0];
          return data.lastPrice;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (e instanceof ApiStatusError && e.status) throw e;
          if (e instanceof Error && e.message && e.message.includes(".")) throw e;
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1, // retries
      timeout, // dynamic timeout
    );
}

export async function fetchBitgetKlines(
    symbol: string,
    interval: string,
    limit: number = 15,
    startTime?: number,
    endTime?: number,
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<Kline[]> {
    const key = `BITGET:${symbol}:${interval}:${limit}:${startTime}:${endTime}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = normalizeSymbol(symbol, "bitget");
          const params = new URLSearchParams({
            provider: "bitget",
            symbol: normalized,
            interval: interval,
            limit: limit.toString()
          });
          if (startTime) params.append("startTime", startTime.toString());
          if (endTime) params.append("endTime", endTime.toString());

          const response = await fetch(`/api/klines?${params.toString()}`, { signal });
          if (!response.ok) throw new Error("apiErrors.klineError");
          const res = await safeJson(response);

          if (!Array.isArray(res)) {
            logger.error("network", `[Bitget] Invalid kline response type: ${typeof res}`, res);
            throw new Error("apiErrors.invalidResponse");
          }

          // Use Bitget Schema
          return res.map((k: unknown) => {
            // Bitget returns array of strings/numbers or objects depending on endpoint version.
            // If it's an object with keys:
            if (k && typeof k === 'object' && !Array.isArray(k)) {
               try {
                  const obj = k as BitgetRawKlineObject;
                  const time = parseTimestamp(obj.timestamp || obj.time || obj.t || obj.ts);
                  const open = new Decimal((obj.open || obj.o) as Decimal.Value);
                  const high = new Decimal((obj.high || obj.h) as Decimal.Value);
                  const low = new Decimal((obj.low || obj.l) as Decimal.Value);
                  const close = new Decimal((obj.close || obj.c) as Decimal.Value);
                  const volume = new Decimal(obj.volume || obj.vol || obj.v || 0);
                  if (!open.isFinite() || !high.isFinite() || !low.isFinite() || !close.isFinite()) {
                      logger.warn("network", "[Bitget] Dropping invalid kline (NaN)", k);
                      return null;
                  }
                  return { open, high, low, close, volume, time };
               } catch { return null; }
            }

            // Array Format Validation
            const validation = BitgetKlineSchema.safeParse(k);
            if (!validation.success) {
                logger.warn("network", "[Bitget] Dropping invalid kline (Schema)", { k, error: validation.error });
                return null;
            }

            const d = validation.data;
            try {
              const time = parseTimestamp(d[0]);
              const open = new Decimal(d[1]);
              const high = new Decimal(d[2]);
              const low = new Decimal(d[3]);
              const close = new Decimal(d[4]);
              const volume = new Decimal(d[5]);

              if (!open.isFinite() || !high.isFinite() || !low.isFinite() || !close.isFinite()) {
                  logger.warn("network", "[Bitget] Dropping invalid kline (NaN Array)", d);
                  return null;
              }
              return { open, high, low, close, volume, time };
            } catch (e) {
              logger.warn("network", "[Bitget] Dropping invalid kline (Exception)", e);
              return null;
            }
          }).filter((k): k is Kline => k !== null);
        } catch (e: unknown) {
          console.error(e);
          if (e instanceof Error && e.name === "AbortError") throw e;
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1,
      timeout
    );
}

export async function fetchBitunixKlines(
    symbol: string,
    interval: string,
    limit: number = 15,
    startTime?: number,
    endTime?: number,
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<Kline[]> {
    // [SYNTHETIC] Dynamic Resolution
    let resolution = { base: interval, intervalMs: 0, isSynthetic: false, multiplier: 1 };
    
    try {
      const { getOptimalTimeframe, safeTfToMs } = await import("../../utils/timeUtils");
      const { BROKER_CAPABILITIES } = await import("../../config/brokerCapabilities");
        
        const bitunixNatives = BROKER_CAPABILITIES["bitunix"]?.nativeTimeframes || ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];
        resolution = getOptimalTimeframe(interval, bitunixNatives);
        
        // Ensure intervalMs is set if fallback happened
        if (resolution.intervalMs === 0) resolution.intervalMs = safeTfToMs(interval);
        
    } catch {
        // Fallback
    }

    const { base: fetchInterval, multiplier, isSynthetic, intervalMs } = resolution;
    const fetchLimit = limit * multiplier;

    // Bitunix truncates every kline response at BITUNIX_MAX_ROWS_PER_REQUEST
    // rows regardless of the `limit` we send. For a native timeframe that just
    // means "you get 200". For a synthetic one it is worse: those 200 BASE
    // candles collapse into 200/multiplier target candles, so a 6m request
    // funded by 1m candles yields 33. That is why indicators with long
    // look-backs (EMA 200 above all) silently vanished on 3m/6m/10m/12m while
    // short ones like RSI still rendered (BUG-0231).
    //
    // When the base-candle demand exceeds one response, walk backwards in
    // pages. The whole walk happens inside a single scheduled request, so it
    // costs one concurrency slot rather than one per page.
    const pagesWanted = Math.max(1, Math.ceil(fetchLimit / BITUNIX_MAX_ROWS_PER_REQUEST));
    const pagesNeeded = Math.min(pagesWanted, MAX_KLINE_PAGES);
    const needsPaging = pagesNeeded > 1;

    if (pagesWanted > pagesNeeded) {
      logger.warn(
        "network",
        `[Bitunix] ${symbol}:${interval} wants ${pagesWanted} pages for ${limit} candles; ` +
          `capped at ${MAX_KLINE_PAGES} (~${(pagesNeeded * BITUNIX_MAX_ROWS_PER_REQUEST) / multiplier} candles). ` +
          `Long look-back indicators may be unavailable on this timeframe.`,
      );
    }

    const safeStart = startTime ?? "0";
    const safeEnd = endTime ?? "0";
    const key = `BITUNIX:${symbol}:${interval}:${limit}:${safeStart}:${safeEnd}`; // Keep original key

    // Paging turns one round trip into up to `pagesNeeded` sequential ones, so
    // the caller's single-request timeout would abort the walk part way.
    const MAX_PAGED_TIMEOUT_MS = 60_000;
    const effectiveTimeout = needsPaging
      ? Math.min(timeout * pagesNeeded, MAX_PAGED_TIMEOUT_MS)
      : timeout;

    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = normalizeSymbol(symbol, "bitunix");

          /** Fetch, validate and map ONE page of base candles. */
          const fetchPage = async (pageEndTime?: number): Promise<Kline[]> => {
            const params = new URLSearchParams({
              provider: "bitunix",
              symbol: normalized,
              interval: fetchInterval, // Use mapped base
              limit: Math.min(fetchLimit, BITUNIX_MAX_ROWS_PER_REQUEST).toString(),
            });
            if (startTime) params.append("startTime", startTime.toString());
            if (pageEndTime) params.append("endTime", pageEndTime.toString());

            const response = await fetch(`/api/klines?${params.toString()}`, {
              signal,
            });
            if (response.status === 404) {
              throw new ApiStatusError("apiErrors.symbolNotFound", 404);
            }
            if (!response.ok) {
              // Try to parse error details
              let errData: { error?: string } = {};
              try {
                errData = await response.json();
              } catch {
                /* ignore parsing error */
              }

              if (errData.error) {
                const lowerErr = String(errData.error).toLowerCase();
                if (
                  lowerErr.includes("symbol not found") ||
                  lowerErr.includes("system error")
                ) {
                  throw new ApiStatusError("apiErrors.symbolNotFound", 404);
                }

                // Log to proper logger
                logger.warn(
                  "network",
                  `[Bitunix] Kline fetch failed (${response.status}): ${errData.error || "Unknown"}`,
                );
              }

              throw new Error("apiErrors.klineError");
            }
            const res = await safeJson(response);

            // Backend returns the mapped array directly
            if (!Array.isArray(res)) {
              if (res && res.error) throw new Error("apiErrors.klineError");
              logger.error("network", `[Bitunix] Invalid kline response type: ${typeof res}`, res);
              throw new Error("apiErrors.invalidResponse");
            }

            // Map the response data to the required Kline interface
            const mapped = res
              .map((kline: unknown) => {
                const validation = BitunixKlineSchema.safeParse(kline);
                if (!validation.success) {
                  logger.warn("network", "Skipping invalid kline", { kline, error: validation.error.issues });
                  return null;
                }
                const d = validation.data;
                const time = parseTimestamp(d.timestamp || d.time || d.ts);
                if (time === 0) {
                    logger.warn("network", "[Bitunix] Dropping invalid kline (Time=0)", d);
                    return null;
                }

                // HARDENING: Check for missing or zero prices
                if (!d.open || !d.close || d.open.isZero() || d.close.isZero()) {
                    return null;
                }

                return {
                  open: d.open,
                  high: d.high,
                  low: d.low,
                  close: d.close,
                  volume: d.volume || d.vol || new Decimal(0),
                  time
                };
              })
              .filter((k): k is Kline => k !== null);

          return mapped;
          };

          // --- Page walk ---------------------------------------------------
          // Page 1 uses the caller's endTime; each further page ends just
          // before the oldest candle seen so far, so the windows abut instead
          // of overlapping or leaving holes.
          let mapped = await fetchPage(endTime);

          if (needsPaging && mapped.length > 0) {
            const seenTimes = new Set(mapped.map((k) => k.time));
            // Computed, not read off index 0: page ordering is the upstream's
            // choice and the proxy only normalises it best-effort. Anchoring
            // the next window on a wrong "oldest" would re-request the same
            // range and quietly stall the walk.
            let oldest = Math.min(...mapped.map((k) => k.time));

            for (let page = 1; page < pagesNeeded; page++) {
              const older = await fetchPage(oldest - 1);
              if (older.length === 0) break; // exchange has no more history

              const fresh = older.filter((k) => !seenTimes.has(k.time));
              // Upstream ignored endTime and replayed the same window. Stop
              // rather than spin -- an unbounded page walk is the failure mode
              // this whole fix exists to remove, not one to reintroduce.
              if (fresh.length === 0) break;

              for (const k of fresh) seenTimes.add(k.time);
              mapped = fresh.concat(mapped);
              oldest = Math.min(oldest, ...fresh.map((k) => k.time));
            }

            mapped.sort((a, b) => a.time - b.time);

            if (import.meta.env.DEV) {
              logger.debug(
                "network",
                `[Bitunix] ${symbol}:${interval} paged ${pagesNeeded}x -> ${mapped.length} ${fetchInterval} candles`,
              );
            }
          }

           // [SYNTHETIC] Generic Aggregation
           if (isSynthetic && intervalMs > 0) {
               // Use resolved intervalMs (target)
               const groups = new Map<number, Kline[]>();

               for (const k of mapped) {
                   const bucketStart = Math.floor(k.time / intervalMs) * intervalMs;
                   if (!groups.has(bucketStart)) groups.set(bucketStart, []);
                   groups.get(bucketStart)!.push(k);
               }

               const aggregated: Kline[] = [];
               const sortedStarts = Array.from(groups.keys()).sort((a, b) => a - b);

               for (const start of sortedStarts) {
                   const bucket = groups.get(start)!;
                   bucket.sort((a, b) => a.time - b.time);
                   
                   const first = bucket[0];
                   const last = bucket[bucket.length - 1];
                   let high = first.high;
                   let low = first.low;
                   let vol = new Decimal(0);

                   for (let i = 0, len = bucket.length; i < len; i++) {
                       const c = bucket[i];
                       // We keep references to the existing Decimal instances
                       // inside the bucket instead of allocating new ones to save memory
                       // and improve performance.
                       if (high.lt(c.high)) {
                           high = c.high;
                       }
                       if (low.gt(c.low)) {
                           low = c.low;
                       }
                       vol = vol.plus(c.volume);
                   }

                   aggregated.push({
                       time: start,
                       open: first.open,
                       high: high,
                       low: low,
                       close: last.close,
                       volume: vol
                   });
               }
               return aggregated;
           }
           
           return mapped;

        } catch (e: unknown) {
          if (e instanceof Error && e.message !== "apiErrors.symbolNotFound") {
            logger.error("network", `fetchBitunixKlines error for ${symbol}`, e);
          }
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (e instanceof ApiStatusError && e.status) throw e;
          if (e instanceof Error && e.message && e.message.includes(".")) throw e;
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1,
      effectiveTimeout,
    );
}

export async function fetchMarketSnapshot(
    provider: "bitunix" | "bitget",
    priority: "high" | "normal" = "normal",
  ): Promise<Ticker24h[]> {
    const key = `${provider.toUpperCase()}:SNAPSHOT`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const params = new URLSearchParams({ provider: provider });
          // Call without 'symbols' param to get all tickers
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });

          if (!response.ok) throw new Error("apiErrors.generic");
          const res = await safeJson(response);

          if (provider === "bitunix") {
            if (res.code !== undefined && res.code !== 0) {
              throw new Error(getBitunixErrorKey(res.code));
            }
            if (!res.data || !Array.isArray(res.data)) {
              throw new Error("apiErrors.invalidResponse");
            }
            return res.data.map((ticker: BitunixRawTicker) => {
              const open = new Decimal(ticker.open || 0);
              const last = new Decimal(ticker.lastPrice || 0);
              const change = !open.isZero()
                ? last.minus(open).dividedBy(open).times(100)
                : new Decimal(0);

              return {
                provider: "bitunix",
                symbol: ticker.symbol,
                lastPrice: last,
                highPrice: new Decimal(ticker.high || 0),
                lowPrice: new Decimal(ticker.low || 0),
                volume: new Decimal(ticker.baseVol || 0),
                quoteVolume: new Decimal(ticker.quoteVol || 0),
                priceChangePercent: change
              };
            });
          } else {
            // Bitget (via backend)
            const data = res.data || [];
            if (!Array.isArray(data)) throw new Error("apiErrors.invalidResponse");

            return data.map((t: BitgetRawTicker) => ({
              provider: "bitget",
              symbol: t.instId || t.symbol,
              lastPrice: new Decimal(t.last || 0),
              highPrice: new Decimal(t.high24h || 0),
              lowPrice: new Decimal(t.low24h || 0),
              volume: new Decimal(t.volume24h || 0),
              quoteVolume: new Decimal(t.quoteVolume || t.usdtVolume || 0),
              priceChangePercent: new Decimal(t.priceChangePercent || 0) // Or calculate
            }));
          }
        } catch (e: unknown) {
          logger.error("network", "Snapshot Fetch Error", e);
          if (e instanceof Error && e.name === "AbortError") throw e;
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
    );
}

export async function fetchTicker24h(
    symbol: string,
    provider: "bitunix" | "bitget",
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<Ticker24h> {
    const key = `TICKER24:${provider}:${symbol}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = normalizeSymbol(symbol, provider);
          const params = new URLSearchParams({
            provider: provider,
            symbols: normalized,
            type: "24hr",
          });
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });

          if (response.status === 404) {
            throw new ApiStatusError("apiErrors.symbolNotFound", 404);
          }
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const data = await safeJson(response);

          if (provider === "bitunix") {
            const validation = BitunixTickerResponseSchema.safeParse(data);
            if (!validation.success) {
              logger.error("network", "[API] Invalid ticker24h response", validation.error.issues);
              throw new Error("apiErrors.invalidResponse");
            }
            const validatedRes = validation.data;
            if (validatedRes.code !== undefined && validatedRes.code !== 0) {
              throw new Error(getBitunixErrorKey(validatedRes.code));
            }
            if (!validatedRes.data || validatedRes.data.length === 0) {
              throw new Error("apiErrors.invalidResponse");
            }
            const ticker = validatedRes.data[0];

            const last = ticker.lastPrice;
            const open = ticker.open || new Decimal(0);
            const high = ticker.high || last;
            const low = ticker.low || last;
            const baseVol = ticker.baseVol || new Decimal(0);
            const quoteVol = ticker.quoteVol || new Decimal(0);

            let change = new Decimal(0);
            if (!open.isZero()) {
              change = last.minus(open).dividedBy(open).times(100);
            }

            return {
              provider,
              symbol: normalized,
              lastPrice: last,
              markPrice: ticker.markPrice ?? undefined,
              highPrice: high,
              lowPrice: low,
              volume: baseVol,
              quoteVolume: quoteVol,
              priceChangePercent: change,
            };
          } else {
            // Bitget
            const ticker = (data.data && data.data[0]) || data;
            if (!ticker) throw new Error("apiErrors.invalidResponse");

            // BUG-0512: Bitget tickers carry markPrice too. Parsed
            // defensively — an unparseable optional field must never take
            // down the required last/high/low alongside it.
            let bitgetMark: Decimal | undefined;
            const rawMark = ticker.markPrice;
            if (rawMark !== undefined && rawMark !== null && rawMark !== "") {
              try {
                bitgetMark = new Decimal(rawMark);
              } catch {
                bitgetMark = undefined;
              }
            }

            return {
              provider,
              symbol: normalized,
              lastPrice: new Decimal(ticker.last || 0),
              markPrice: bitgetMark,
              highPrice: new Decimal(ticker.high24h || 0),
              lowPrice: new Decimal(ticker.low24h || 0),
              volume: new Decimal(ticker.volume24h || 0),
              quoteVolume: new Decimal(ticker.quoteVolume || ticker.usdtVolume || 0),
              priceChangePercent: new Decimal(ticker.priceChangePercent || 0)
            };
          }
        } catch (e: unknown) {
          logger.error("network", "fetchTicker24h error", e);
          if (e instanceof Error && e.name === "AbortError") throw e; // Pass through for RequestManager
          if (
            e instanceof Error &&
            (e.message.startsWith("apiErrors.") ||
              e.message.startsWith("bitunixErrors."))
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1,
      timeout,
    );
}

  // Source of truth for funding rate: Bitunix's REST funding_rate/batch
  // endpoint. Its docs describe `fundingRate` as a fraction (example
  // "0.0005"), but live wire data confirms it is actually already a
  // PERCENTAGE, same as the WS `price` channel's `fr` field (see
  // bitunixWs.ts) - raw "-0.005776" for BTCUSDT matched Bitunix's own UI
  // reading of -0.0057% almost exactly, not -0.5776% (what the documented
  // fraction convention would imply). Normalized to a fraction here, once,
  // at ingestion, so the store/display (`.times(100)`) stay unchanged.
  //
  // Also filters to USDT-margined pairs only ("...USDT"): the batch
  // response includes coin-margined (BTCUSD) and USDC-margined (BTCUSDC)
  // variants of the same underlying, which are different products Cachy
  // doesn't trade and must never be conflated with the USDT pair.
export async function fetchBitunixFundingRates(
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<Map<string, FundingRateEntry>> {
    const key = "FUNDING_RATE:bitunix:ALL";
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const response = await fetch(`/api/funding-rate?provider=bitunix`, {
            signal,
          });
          if (!response.ok) throw new Error("apiErrors.generic");
          const data = await safeJson(response);

          const validation = BitunixFundingRateBatchResponseSchema.safeParse(data);
          if (!validation.success) {
            logger.error("network", "[API] Invalid funding rate response", validation.error.issues);
            throw new Error("apiErrors.invalidResponse");
          }
          const validatedRes = validation.data;
          if (validatedRes.code !== undefined && validatedRes.code !== 0) {
            throw new Error(getBitunixErrorKey(validatedRes.code));
          }
          if (!validatedRes.data) {
            throw new Error("apiErrors.invalidResponse");
          }

          const result = new Map<string, FundingRateEntry>();
          for (const entry of validatedRes.data) {
            if (!entry.symbol.endsWith("USDT")) continue; // skip coin-/USDC-margined variants (BTCUSD, BTCUSDC, ...)
            const symbol = normalizeSymbol(entry.symbol, "bitunix");
            const fundingRate = entry.fundingRate.dividedBy(100);
            if (isNetworkLoggingEnabled()) {
              logger.log("network", `[FUNDING RATE] ${symbol}: raw="${entry.fundingRate}" -> fraction ${fundingRate} (predicted, not yet settled)`, undefined, true);
            }
            result.set(symbol, {
              fundingRate,
              nextFundingTime: entry.nextFundingTime,
              fundingInterval: entry.fundingInterval,
            });
          }
          return result;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (
            e instanceof Error &&
            (e.message.startsWith("apiErrors.") ||
              e.message.startsWith("bitunixErrors."))
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1,
      timeout,
    );
}

export async function fetchBitunixFundingRateHistory(
    symbol: string,
    limit = 30,
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<FundingRateHistoryItem[]> {
    const rawSymbol = normalizeSymbol(symbol, "bitunix");
    const key = `FUNDING_RATE_HISTORY:bitunix:${rawSymbol}:${limit}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const response = await fetch(
            `/api/funding-rate?provider=bitunix&symbol=${encodeURIComponent(rawSymbol)}&limit=${limit}`,
            { signal },
          );
          if (!response.ok) throw new Error("apiErrors.generic");
          const data = await safeJson(response);

          const validation = BitunixFundingRateHistoryResponseSchema.safeParse(data);
          if (!validation.success) {
            logger.error("network", "[API] Invalid funding rate history response", validation.error.issues);
            throw new Error("apiErrors.invalidResponse");
          }
          const validatedRes = validation.data;
          if (validatedRes.code !== undefined && validatedRes.code !== 0) {
            throw new Error(getBitunixErrorKey(validatedRes.code));
          }
          if (!validatedRes.data) {
            throw new Error("apiErrors.invalidResponse");
          }

          const items: FundingRateHistoryItem[] = validatedRes.data.map((entry) => {
            // Unlike funding_rate/batch (percent, needs /100 — see
            // fetchBitunixFundingRates), get_funding_rate_history already
            // returns the rate as a fraction, e.g. "-0.00001191" (see
            // docs/bitunix-api/04_market.md response example).
            const fundingRate = entry.fundingRate;
            const fundingTime =
              typeof entry.fundingTime === "string"
                ? parseInt(entry.fundingTime, 10)
                : entry.fundingTime;
            return {
              fundingRate,
              fundingTime: isNaN(fundingTime) ? 0 : fundingTime,
              markPrice: entry.markPrice ?? null,
            };
          });

          // Sort chronologically ascending (oldest first, newest last)
          items.sort((a, b) => a.fundingTime - b.fundingTime);
          return items;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (
            e instanceof Error &&
            (e.message.startsWith("apiErrors.") ||
              e.message.startsWith("bitunixErrors."))
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic", { cause: e });
        }
      },
      priority,
      1,
      timeout,
    );
}
