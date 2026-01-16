import { Decimal } from "decimal.js";
import { getBitunixErrorKey } from "../utils/errorUtils";
import { parseTimestamp } from "../utils/utils";
import { normalizeSymbol } from "../utils/symbolUtils";
import type { Kline } from "./technicalsTypes";
export type { Kline };

export interface Ticker24h {
  provider: "bitunix" | "binance";
  symbol: string;
  lastPrice: Decimal;
  priceChangePercent: Decimal;
  highPrice: Decimal;
  lowPrice: Decimal;
  volume: Decimal; // Base volume usually
  quoteVolume?: Decimal;
}

// Define the structure of a Binance Kline entry
// [Open time, Open, High, Low, Close, Volume, Close time, Quote asset volume, Number of trades, Taker buy base asset volume, Taker buy quote asset volume, Ignore]
type BinanceKline = [
  number, // Open time
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // Close time
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string // Ignore
];

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

  // Logging for debugging latency
  private readonly LOG_LIMIT = 50;

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
    timeout?: number
  ): Promise<T> {
    const now = Date.now();

    // 0. Cache Check
    const cached = this.cache.get(key);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return Promise.resolve(cached.data as T);
    }

    // 1. Deduplication: If already fetching this key, return existing promise
    if (this.pending.has(key)) {
      return this.pending.get(key) as Promise<T>;
    }

    // 2. Wrap in queue logic
    const promise = new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.activeCount++;

        try {
          // Wrapped task with Timeout and Retry
          const executeWithRetry = async (attempt: number): Promise<T> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              timeout || this.DEFAULT_TIMEOUT
            );

            try {
              return await task(controller.signal);
            } catch (e) {
              if (e instanceof Error && e.name === "AbortError") {
                console.warn(`[ReqMgr] Timeout for ${key}`);
              }
              if (attempt < retries) {
                const errorMsg = e instanceof Error ? e.message.toLowerCase() : "";
                const is404 = errorMsg.includes("404") || (e as any).status === 404;
                const isSystemError = errorMsg.includes("system error");

                // DON'T retry on 404 (Not Found) or "System error" (invalid symbol for Bitunix)
                if (is404 || isSystemError) {
                  throw e;
                }

                console.warn(
                  `[ReqMgr] Retrying ${key} (Attempt ${attempt + 1}/${retries + 1
                  })`,
                  e
                );
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

          resolve(result);
        } catch (e) {
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
  normalizeSymbol(symbol: string, provider: "bitunix" | "binance"): string {
    return normalizeSymbol(symbol, provider);
  },

  async safeJson(response: Response) {
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Expected JSON but received:", text.slice(0, 100));
      throw new Error("apiErrors.invalidResponseFormat");
    }
    return response.json();
  },

  async fetchBitunixPrice(
    symbol: string,
    priority: "high" | "normal" = "high",
    timeout = 5000
  ): Promise<Decimal> {
    if (!symbol || symbol.length < 3) throw new Error("apiErrors.symbolNotFound");
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
          if (res.code !== undefined && res.code !== 0) {
            const error = new Error(getBitunixErrorKey(res.code));
            if (res.code === 2 || res.code === "2") (error as any).status = 404;
            throw error;
          }
          if (!res.data || res.data.length === 0) {
            const error = new Error("apiErrors.invalidResponse");
            (error as any).status = 404; // Empty data for a ticker often means symbol not found
            throw error;
          }
          const data = res.data[0];
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
      timeout // dynamic timeout
    );
  },

  async fetchBitunixKlines(
    symbol: string,
    interval: string,
    limit: number = 15,
    startTime?: number,
    endTime?: number,
    priority: "high" | "normal" = "normal",
    timeout = 10000
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
          if (startTime) params.append("start", startTime.toString());
          if (endTime) params.append("end", endTime.toString());

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
              if (errData.error) {
                console.error(
                  `fetchBitunixKlines failed with ${response.status}: ${errData.error}`
                );
                // If it's a rate limit or specific error, we might want to preserve it
                // But for now, let's at least log it and maybe throw a more descriptive error if possible
                // keeping the key for i18n but logged the real cause
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
                    kline.timestamp || kline.time || kline.ts
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
                  console.warn("Skipping invalid kline:", kline, e);
                  return null;
                }
              }
            )
            .filter((k): k is Kline => k !== null);
        } catch (e: any) {
          console.error(`fetchBitunixKlines error for ${symbol}:`, e);
          if (e instanceof Error && e.name === "AbortError") throw e;
          if (e.status || (e.message && e.message.includes("."))) throw e;
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1,
      timeout
    );
  },

  async fetchBinancePrice(
    symbol: string,
    priority: "high" | "normal" = "high",
    timeout = 5000
  ): Promise<Decimal> {
    const key = `BINANCE:PRICE:${symbol}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = apiService.normalizeSymbol(symbol, "binance");
          const params = new URLSearchParams({
            provider: "binance",
            symbols: normalized,
          });
          const response = await fetch(`/api/tickers?${params.toString()}`, {
            signal,
          });
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const data = await response.json();

          if (!data || data.price === undefined || data.price === null) {
            throw new Error("apiErrors.invalidResponse");
          }
          const price = Number(data.price);
          if (isNaN(price) || !isFinite(price)) {
            throw new Error("apiErrors.invalidResponse");
          }
          return new Decimal(price);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e; // Pass through for RequestManager
          if (
            e instanceof Error &&
            (e.message === "apiErrors.symbolNotFound" ||
              e.message === "apiErrors.invalidResponse")
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1, // retries
      timeout // dynamic timeout
    );
  },

  async fetchBinanceKlines(
    symbol: string,
    interval: string,
    limit: number = 15,
    priority: "high" | "normal" = "normal",
    timeout = 10000
  ): Promise<Kline[]> {
    const key = `BINANCE:${symbol}:${interval}:${limit}`;
    return requestManager.schedule(
      key,
      async (signal) => {
        try {
          const normalized = apiService.normalizeSymbol(symbol, "binance");
          const params = new URLSearchParams({
            provider: "binance",
            symbol: normalized,
            interval: interval,
            limit: limit.toString(),
          });
          const response = await fetch(`/api/klines?${params.toString()}`, {
            signal,
          });
          if (!response.ok) throw new Error("apiErrors.klineError");
          const data = await response.json();

          if (!Array.isArray(data)) {
            throw new Error("apiErrors.invalidResponse");
          }

          // Binance kline format: [ [time, open, high, low, close, volume, ...], ... ]
          return data
            .map((kline: BinanceKline) => {
              try {
                const time = parseTimestamp(kline[0]);
                const open = new Decimal(kline[1] || 0);
                const high = new Decimal(kline[2] || 0);
                const low = new Decimal(kline[3] || 0);
                const close = new Decimal(kline[4] || 0);
                const volume = new Decimal(kline[5] || 0);

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
                console.warn("Skipping invalid Binance kline:", kline, e);
                return null;
              }
            })
            .filter((k): k is Kline => k !== null);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e; // Pass through for RequestManager
          if (
            e instanceof Error &&
            (e.message === "apiErrors.klineError" ||
              e.message === "apiErrors.invalidResponse")
          ) {
            throw e;
          }
          throw new Error("apiErrors.generic");
        }
      },
      priority,
      1,
      timeout
    );
  },

  async fetchTicker24h(
    symbol: string,
    provider: "bitunix" | "binance",
    priority: "high" | "normal" = "normal",
    timeout = 10000
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
            const openRaw = Number(ticker.open);
            const lastRaw = Number(ticker.lastPrice);
            const highRaw = Number(ticker.high);
            const lowRaw = Number(ticker.low);
            const baseVolRaw = Number(ticker.baseVol);
            const quoteVolRaw = Number(ticker.quoteVol);

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
              highPrice: new Decimal(ticker.high),
              lowPrice: new Decimal(ticker.low),
              volume: new Decimal(ticker.baseVol),
              quoteVolume: new Decimal(ticker.quoteVol),
              priceChangePercent: change,
            };
          } else {
            // Binance
            const lastRaw = Number(data.lastPrice);
            if (isNaN(lastRaw) || !isFinite(lastRaw)) {
              throw new Error("apiErrors.invalidResponse");
            }

            const highRaw = Number(data.highPrice);
            const lowRaw = Number(data.lowPrice);
            const baseVolRaw = Number(data.volume);
            const quoteVolRaw = Number(data.quoteVolume);
            const changeRaw = Number(data.priceChangePercent);

            return {
              provider,
              symbol: normalized,
              lastPrice: new Decimal(lastRaw),
              highPrice: new Decimal(isNaN(highRaw) ? lastRaw : highRaw),
              lowPrice: new Decimal(isNaN(lowRaw) ? lastRaw : lowRaw),
              volume: new Decimal(isNaN(baseVolRaw) ? 0 : baseVolRaw),
              quoteVolume: new Decimal(isNaN(quoteVolRaw) ? 0 : quoteVolRaw),
              priceChangePercent: new Decimal(isNaN(changeRaw) ? 0 : changeRaw),
            };
          }
        } catch (e) {
          console.error("fetchTicker24h error", e);
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
      timeout
    );
  },
};
