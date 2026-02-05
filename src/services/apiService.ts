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
import { marketState } from "../stores/market.svelte";
import { logger } from "./logger";
import { safeJsonParse } from "../utils/safeJson";
import type { Kline } from "./technicalsTypes";
import {
  BitunixTickerResponseSchema,
  BitunixKlineSchema,
  BitgetKlineSchema,
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

// --- Rate Limiter (Token Bucket) ---
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRateMs: number;

  constructor(tokensPerSecond: number, capacity?: number) {
    this.capacity = capacity ?? tokensPerSecond;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.refillRateMs = tokensPerSecond / 1000;
  }

  async waitForToken(): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Calculate wait time for 1 token
      const needed = 1 - this.tokens;
      const waitTime = needed / this.refillRateMs;

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const newTokens = elapsed * this.refillRateMs;
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
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
  private readonly MAX_CACHE_SIZE = 100; // Hard limit on cache size
  private readonly CLEANUP_INTERVAL = 30000; // Check every 30s (more frequent)

  // Rate Limiters
  private rateLimiters = new Map<string, RateLimiter>();

  // Logging for debugging latency
  private readonly LOG_LIMIT = 50;

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic cleanup to prevent memory leaks
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.pruneCache(), this.CLEANUP_INTERVAL);
    }

    // Initialize Rate Limiters
    // Bitunix: Conservative 5 req/s with no burst to avoid 500 "frequent request" error
    this.rateLimiters.set("BITUNIX", new RateLimiter(5, 1));
    // Bitget: Usually 20 req/s
    this.rateLimiters.set("BITGET", new RateLimiter(20));
  }

  public destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearCache();
  }

  private pruneCache() {
    const now = Date.now();
    let removedCount = 0;

    // 1. Time-based eviction
    this.cache.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        removedCount++;
      }
    });

    // 2. Hard limit eviction (FIFO-like via Map iteration order)
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const excess = this.cache.size - this.MAX_CACHE_SIZE;
      let evicted = 0;
      for (const key of this.cache.keys()) {
        if (evicted >= excess) break;
        this.cache.delete(key);
        evicted++;
        removedCount++;
      }
    }

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
          // Rate Limit Check
          let provider = "";
          if (key.startsWith("BITUNIX") || key.includes(":bitunix:"))
            provider = "BITUNIX";
          else if (key.startsWith("BITGET") || key.includes(":bitget:"))
            provider = "BITGET";

          if (provider && this.rateLimiters.has(provider)) {
            await this.rateLimiters.get(provider)!.waitForToken();
          }

          logger.debug("network", `[Request] Start: ${key}`);
          const startFetch = performance.now();
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
          const latency = performance.now() - startFetch;

          // Update telemetry
          marketState.recordApiCall();
          marketState.updateTelemetry({ apiLatency: latency });

          // Store in cache upon success (only if it matches the current request)
          // Prune before adding if full
          if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
          }
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    requestManager.destroy();
  });
}

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
      return safeJsonParse(text);
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
          return data.lastPrice;
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
            logger.error("network", `[Bitget] Invalid kline response type: ${typeof res}`, res);
            throw new Error("apiErrors.invalidResponse");
          }

          // Use Bitget Schema
          return res.map((k: any) => {
            // Bitget returns array of strings/numbers or objects depending on endpoint version.
            // If it's an object with keys:
            if (k && typeof k === 'object' && !Array.isArray(k)) {
               try {
                  const time = parseTimestamp(k.timestamp || k.time || k.t || k.ts);
                  const open = new Decimal(k.open || k.o);
                  const high = new Decimal(k.high || k.h);
                  const low = new Decimal(k.low || k.l);
                  const close = new Decimal(k.close || k.c);
                  const volume = new Decimal(k.volume || k.vol || k.v || 0);
                  if (open.isNaN() || high.isNaN() || low.isNaN() || close.isNaN()) {
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

              if (open.isNaN() || high.isNaN() || low.isNaN() || close.isNaN()) {
                  logger.warn("network", "[Bitget] Dropping invalid kline (NaN Array)", d);
                  return null;
              }
              return { open, high, low, close, volume, time };
            } catch (e) {
              logger.warn("network", "[Bitget] Dropping invalid kline (Exception)", e);
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
    const safeStart = startTime ?? "0";
    const safeEnd = endTime ?? "0";
    const key = `BITUNIX:${symbol}:${interval}:${limit}:${safeStart}:${safeEnd}`;
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
            let errData: any = {};
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
                const error = new Error("apiErrors.symbolNotFound");
                (error as any).status = 404;
                throw error;
              }

              // Log to proper logger
              logger.warn(
                "network",
                `[Bitunix] Kline fetch failed (${response.status}): ${errData.error || "Unknown"}`,
              );
            }

            throw new Error("apiErrors.klineError");
          }
          const res = await apiService.safeJson(response);

          // Backend returns the mapped array directly
          if (!Array.isArray(res)) {
            if (res && res.error) throw new Error("apiErrors.klineError");
            logger.error("network", `[Bitunix] Invalid kline response type: ${typeof res}`, res);
            throw new Error("apiErrors.invalidResponse");
          }

          // Map the response data to the required Kline interface
          return res
            .map((kline: any) => {
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
              // d.open/close are Decimals (from BitunixKlineSchema)
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
          const data = await apiService.safeJson(response);

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
