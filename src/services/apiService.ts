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

import { Decimal } from "decimal.js";
import { getBitunixErrorKey } from "../utils/errorUtils";
import { parseTimestamp } from "../utils/utils";
import { normalizeSymbol } from "../utils/symbolUtils";
import { settingsState } from "../stores/settings.svelte";
import { logger } from "./logger";
import type { Kline } from "./technicalsTypes";
import {
  BitunixTickerResponseSchema,
  validateResponseSize,
  sanitizeErrorMessage,
} from "../types/apiSchemas";
export type { Kline };

export interface Ticker24h {
  provider: "bitunix" | "bitget";
  symbol: string;
  lastPrice: Decimal;
  priceChangePercent: Decimal;
  highPrice: Decimal;
  lowPrice: Decimal;
  volume: Decimal; // Base volume usually
  quoteVolume?: Decimal;
}

// --- Request Manager for Global Concurrency & Deduplication ---
class RequestManager {
  private pending = new Map<string, Promise<unknown>>();
  private cache = new Map<string, { data: unknown; timestamp: number }>();

  // Two queues for Priority handling
  private highPriorityQueue: (() => void)[] = [];
  private normalQueue: (() => void)[] = [];

  private activeCount = 0;
  private readonly MAX_CONCURRENCY = 8;
  private readonly DEFAULT_TIMEOUT = 10000;
  private readonly CACHE_TTL = 10000; // 10s cache for successful requests
  private readonly CLEANUP_INTERVAL = 60000; // Check every 60s

  // Logging for debugging latency
  private readonly LOG_LIMIT = 50;

  constructor() {
    // Start periodic cleanup to prevent memory leaks
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.pruneCache(), this.CLEANUP_INTERVAL);
    }
  }

  private pruneCache() {
    const now = Date.now();
    let removedCount = 0;
    this.cache.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        removedCount++;
      }
    });

    if (removedCount > 0 && import.meta.env.DEV && settingsState.enableNetworkLogs) {
      logger.debug("network", `[Cache] Pruned ${removedCount} items. Current size: ${this.cache.size}`);
    }
  }

  /**
   * Execute a fetch usage deduping and queuing.
   * @param key Unique key for deduplication (e.g. "BITUNIX:BTCUSDT:1h")
   * @param task The async function that performs the actual fetch. It receives an AbortSignal.
   * @param priority 'high' or 'normal' (default)
   */
  async schedule<T>(
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    priority: "high" | "normal" = "normal",
    retries = 1,
    timeout?: number,
  ): Promise<T> {
    const now = Date.now();

    // 0. Cache Check
    const cached = this.cache.get(key);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      logger.debug("network", `[Cache] Hit: ${key}`);
      return Promise.resolve(cached.data as T);
    }

    // 1. Deduplication: If already fetching this key, return existing promise
    if (this.pending.has(key)) {
      logger.debug("network", `[Dedupe] Joined: ${key}`);
      return this.pending.get(key) as Promise<T>;
    }

    // 2. Wrap in queue logic
    const promise = new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.activeCount++;

        try {
          logger.debug("network", `[Request] Start: ${key}`);
          // Wrapped task with Timeout and Retry
          const executeWithRetry = async (attempt: number): Promise<T> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              timeout || this.DEFAULT_TIMEOUT,
            );

            try {
              return await task(controller.signal);
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") {
                logger.warn("network", `[ReqMgr] Timeout for ${key}`);
              }
              if (attempt < retries) {
                const errorMsg =
                  e instanceof Error ? e.message.toLowerCase() : "";
                const is404 =
                  errorMsg.includes("404") || (e as any).status === 404;
                const isSystemError = errorMsg.includes("system error");

                // DON'T retry on 404 (Not Found) or "System error" (invalid symbol for Bitunix)
                if (is404 || isSystemError) {
                  throw e;
                }

                if (settingsState.enableNetworkLogs) {
                  logger.log(
                    "network",
                    `[ReqMgr] Retrying ${key} (Attempt ${attempt + 1}/${retries + 1})`
                  );
                }
                // Wait a bit before retry (increased for rate limit recovery)
                await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
                return executeWithRetry(attempt + 1);
              }
              throw e;
            } finally {
              clearTimeout(timeoutId);
            }
          };

          const result = await executeWithRetry(0);

          // Store in cache upon success (only if it matches the current request)
          this.cache.set(key, { data: result, timestamp: Date.now() });

          if (settingsState.enableNetworkLogs) {
            logger.log("network", `[Response] Success: ${key}`);
          }
          resolve(result);
        } catch (e) {
          if (settingsState.enableNetworkLogs) {
            logger.error("network", `[Response] Failed: ${key}`, e);
          }
          reject(e);
        } finally {
          this.activeCount--;
          this.pending.delete(key);
          this.next();
        }
      };

      if (this.activeCount < this.MAX_CONCURRENCY) {
        run();
      } else {
        // Enqueue based on priority
        if (priority === "high") {
          this.highPriorityQueue.push(run);
        } else {
          this.normalQueue.push(run);
        }
      }
    });

    this.pending.set(key, promise);
    return promise;
  }

  private next() {
    // Drain High Priority first
    if (this.activeCount < this.MAX_CONCURRENCY) {
      if (this.highPriorityQueue.length > 0) {
        const nextTask = this.highPriorityQueue.shift();
        nextTask?.();
      } else if (this.normalQueue.length > 0) {
        const nextTask = this.normalQueue.shift();
        nextTask?.();
      }
    }
  }

  public clearCache(): void {
    this.cache.clear();
    this.pending.clear();
    this.highPriorityQueue = [];
    this.normalQueue = [];
  }
}

export const requestManager = new RequestManager();

export function clearApiCache() {
  requestManager.clearCache();
}

export const apiService = {
  normalizeSymbol(symbol: string, provider: "bitunix" | "bitget"): string {
    return normalizeSymbol(symbol, provider);
  },

  async safeJson(response: Response, maxSizeMB: number = 10) {
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      // Sanitize error message (max 100 chars, no sensitive data)
      const sanitized = sanitizeErrorMessage(text, 100);
      logger.error("network", "[API] Expected JSON, got", sanitized);
      throw new Error("apiErrors.invalidResponseFormat");
    }

    const text = await response.text();

    // Validate size
    if (!validateResponseSize(text, maxSizeMB)) {
      throw new Error("apiErrors.responseTooLarge");
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      logger.error("network", "[API] JSON parse error");
      throw new Error("apiErrors.invalidJson");
    }
  },

  async fetchBitunixPrice(
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
          const normalized = apiService.normalizeSymbol(symbol, "bitunix");
          const params = new URLSearchParams({
            provider: "bitunix",
            symbols: normalized,
          });
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });
          if (response.status === 404) {
            const error = new Error("apiErrors.symbolNotFound");
            (error as any).status = 404;
            throw error;
          }
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const res = await apiService.safeJson(response);

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
            const error = new Error(getBitunixErrorKey(validatedRes.code));
            if (validatedRes.code === 2 || validatedRes.code === "2")
              (error as any).status = 404;
            throw error;
          }
          if (!validatedRes.data || validatedRes.data.length === 0) {
            const error = new Error("apiErrors.invalidResponse");
            (error as any).status = 404;
            throw error;
          }
          const data = validatedRes.data[0];
          const lastPrice = Number(data.lastPrice);
          if (isNaN(lastPrice) || !isFinite(lastPrice)) {
            throw new Error("apiErrors.invalidResponse");
          }
          return new Decimal(lastPrice);
        } catch (e: any) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (e.status || (e.message && e.message.includes("."))) throw e;
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1, // retries
      timeout, // dynamic timeout
    );
  },

  async fetchBitgetKlines(
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
          const normalized = apiService.normalizeSymbol(symbol, "bitget");
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
          const res = await apiService.safeJson(response);

          if (!Array.isArray(res)) {
            throw new Error("apiErrors.invalidResponse");
          }

          return res.map((k: any) => {
            try {
              const time = parseTimestamp(k.timestamp || k.time || k.t);
              const open = new Decimal(k.open);
              const high = new Decimal(k.high);
              const low = new Decimal(k.low);
              const close = new Decimal(k.close);
              const volume = new Decimal(k.volume);

              if (open.isNaN() || high.isNaN() || low.isNaN() || close.isNaN()) return null;
              return { open, high, low, close, volume, time };
            } catch (e) {
              return null;
            }
          }).filter((k): k is Kline => k !== null);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1,
      timeout
    );
  },

  async fetchBitunixKlines(
    symbol: string,
    interval: string,
    limit: number = 15,
    startTime?: number,
    endTime?: number,
    priority: "high" | "normal" = "normal",
    timeout = 10000,
  ): Promise<Kline[]> {
    const key = `BITUNIX:${symbol}:${interval}:${limit}:${startTime}:${endTime}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = apiService.normalizeSymbol(symbol, "bitunix");
          const params = new URLSearchParams({
            provider: "bitunix",
            symbol: normalized,
            interval: interval,
            limit: limit.toString(),
          });
          if (startTime) params.append("startTime", startTime.toString());
          if (endTime) params.append("endTime", endTime.toString());

          const response = await fetch(`/api/klines?${params.toString()}`, {
            signal,
          });
          if (response.status === 404) {
            const error = new Error("apiErrors.symbolNotFound");
            (error as any).status = 404;
            throw error;
          }
          if (!response.ok) {
            // Try to parse error details
            try {
              const errData = await response.json();
              if (
                errData.error &&
                !errData.error.includes("Symbol not found")
              ) {
                if (import.meta.env.DEV) {
                  console.error(
                    `fetchBitunixKlines failed with ${response.status}: ${errData.error}`,
                  );
                }
              }
            } catch {
              /* ignore parsing error */
            }
            throw new Error("apiErrors.klineError");
          }
          const res = await apiService.safeJson(response);

          // Backend returns the mapped array directly
          if (!Array.isArray(res)) {
            if (res.error) throw new Error(res.error);
            throw new Error("apiErrors.invalidResponse");
          }

          // Map the response data to the required Kline interface
          return res
            .map(
              (kline: {
                open: string | number;
                high: string | number;
                low: string | number;
                close: string | number;
                vol?: string | number;
                timestamp?: number;
                time?: number;
                ts?: number;
              }) => {
                try {
                  const open = new Decimal(kline.open || 0);
                  const high = new Decimal(kline.high || 0);
                  const low = new Decimal(kline.low || 0);
                  const close = new Decimal(kline.close || 0);
                  const volume = new Decimal(kline.vol || 0);
                  const time = parseTimestamp(
                    kline.timestamp || kline.time || kline.ts,
                  );

                  // Validate basic financial consistency
                  if (
                    open.isNaN() ||
                    high.isNaN() ||
                    low.isNaN() ||
                    close.isNaN() ||
                    time === 0
                  ) {
                    return null;
                  }

                  return { open, high, low, close, volume, time };
                } catch (e) {
                  logger.warn("network", "Skipping invalid kline", { kline, error: e });
                  return null;
                }
              },
            )
            .filter((k): k is Kline => k !== null);
        } catch (e: any) {
          if (e.message !== "apiErrors.symbolNotFound") {
            logger.error("network", `fetchBitunixKlines error for ${symbol}`, e);
          }
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (e.status || (e.message && e.message.includes("."))) throw e;
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1,
      timeout,
    );
  },

  async fetchMarketSnapshot(
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
          const res = await apiService.safeJson(response);

          if (provider === "bitunix") {
            if (res.code !== undefined && res.code !== 0) {
              throw new Error(getBitunixErrorKey(res.code));
            }
            if (!res.data || !Array.isArray(res.data)) {
              throw new Error("apiErrors.invalidResponse");
            }
            return res.data.map((ticker: any) => {
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

            return data.map((t: any) => ({
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
        } catch (e) {
          logger.error("network", "Snapshot Fetch Error", e);
          if (e instanceof Error && e.name === "AbortError") throw e;
          throw new Error("apiErrors.generic");
        }
      },
      priority,
    );
  },

  async fetchTicker24h(
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
          const normalized = apiService.normalizeSymbol(symbol, provider);
          const params = new URLSearchParams({
            provider: provider,
            symbols: normalized,
            type: "24hr",
          });
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });

          if (response.status === 404) {
            const error = new Error("apiErrors.symbolNotFound");
            (error as any).status = 404;
            throw error;
          }
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const data = await response.json();

          if (provider === "bitunix") {
            if (data.code !== undefined && data.code !== 0) {
              throw new Error(getBitunixErrorKey(data.code));
            }
            if (!data.data || data.data.length === 0) {
              throw new Error("apiErrors.invalidResponse");
            }
            const ticker = data.data[0];
            const openRaw =
              ticker.open !== undefined && ticker.open !== null
                ? Number(ticker.open)
                : 0;
            const lastRaw =
              ticker.lastPrice !== undefined && ticker.lastPrice !== null
                ? Number(ticker.lastPrice)
                : NaN; // Keep NaN for validation below
            const highRaw =
              ticker.high !== undefined && ticker.high !== null
                ? Number(ticker.high)
                : NaN;
            const lowRaw =
              ticker.low !== undefined && ticker.low !== null
                ? Number(ticker.low)
                : NaN;
            const baseVolRaw =
              ticker.baseVol !== undefined && ticker.baseVol !== null
                ? Number(ticker.baseVol)
                : 0;
            const quoteVolRaw =
              ticker.quoteVol !== undefined && ticker.quoteVol !== null
                ? Number(ticker.quoteVol)
                : 0;

            if (isNaN(lastRaw) || !isFinite(lastRaw)) {
              throw new Error("apiErrors.invalidResponse");
            }

            const open = new Decimal(isNaN(openRaw) ? 0 : openRaw);
            const last = new Decimal(lastRaw);
            const high = new Decimal(isNaN(highRaw) ? lastRaw : highRaw);
            const low = new Decimal(isNaN(lowRaw) ? lastRaw : lowRaw);
            const baseVol = new Decimal(isNaN(baseVolRaw) ? 0 : baseVolRaw);
            const quoteVol = new Decimal(isNaN(quoteVolRaw) ? 0 : quoteVolRaw);

            let change = new Decimal(0);
            if (!open.isZero()) {
              change = last.minus(open).dividedBy(open).times(100);
            }

            return {
              provider,
              symbol: normalized,
              lastPrice: last,
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

            return {
              provider,
              symbol: normalized,
              lastPrice: new Decimal(ticker.last || 0),
              highPrice: new Decimal(ticker.high24h || 0),
              lowPrice: new Decimal(ticker.low24h || 0),
              volume: new Decimal(ticker.volume24h || 0),
              quoteVolume: new Decimal(ticker.quoteVolume || ticker.usdtVolume || 0),
              priceChangePercent: new Decimal(ticker.priceChangePercent || 0)
            };
          }
        } catch (e) {
          logger.error("network", "fetchTicker24h error", e);
          if (e instanceof Error && e.name === "AbortError") throw e; // Pass through for RequestManager
          if (
            e instanceof Error &&
            (e.message.startsWith("apiErrors.") ||
              e.message.startsWith("bitunixErrors."))
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1,
      timeout,
    );
  },
};
