import { Decimal } from "decimal.js";
import { getBitunixErrorKey } from "../utils/errorUtils";
import { parseTimestamp } from "../utils/utils";
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
  // Two queues for Priority handling
  private highPriorityQueue: (() => void)[] = [];
  private normalQueue: (() => void)[] = [];

  private activeCount = 0;
  private readonly MAX_CONCURRENCY = 8; // Increased from 4 for better parallelism
  private readonly DEFAULT_TIMEOUT = 10000; // 10s global timeout

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
                console.warn(
                  `[ReqMgr] Retrying ${key} (Attempt ${attempt + 1}/${
                    retries + 1
                  })`,
                  e
                );
                // Wait a bit before retry
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                return executeWithRetry(attempt + 1);
              }
              throw e;
            } finally {
              clearTimeout(timeoutId);
            }
          };

          const result = await executeWithRetry(0);
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
}

export const requestManager = new RequestManager();

export const apiService = {
  // Helper to normalize symbols for API calls
  normalizeSymbol(symbol: string, provider: "bitunix" | "binance"): string {
    if (!symbol) return "";
    let s = symbol.toUpperCase();

    // 1. Strip known Futures suffixes
    // Handle "BTCUSDT.P" -> "BTCUSDT"
    if (s.endsWith(".P")) {
      s = s.slice(0, -2);
    }
    // Handle "BTCUSDTP" -> "BTCUSDT"
    // We only strip 'P' if it follows 'USDT' to avoid accidental stripping of coins ending in P
    else if (s.endsWith("USDTP")) {
      s = s.slice(0, -1);
    }

    // 2. Append base pair if missing (assuming USDT defaults for this context)
    if (!s.includes("USDT") && !s.includes("USD")) {
      s += "USDT";
    }

    return s;
  },

  async fetchBitunixPrice(
    symbol: string,
    priority: "high" | "normal" = "high",
    timeout = 5000
  ): Promise<Decimal> {
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
          if (!response.ok) throw new Error("apiErrors.symbolNotFound");
          const res = await response.json();
          if (res.code !== undefined && res.code !== 0) {
            throw new Error(getBitunixErrorKey(res.code));
          }
          if (!res.data || res.data.length === 0) {
            throw new Error("apiErrors.invalidResponse");
          }
          const data = res.data[0];
          return new Decimal(data.lastPrice);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") throw e; // Pass through for RequestManager
          if (e instanceof Error) {
            const msg = e.message;
            if (
              msg.startsWith("apiErrors.") ||
              msg.startsWith("bitunixErrors.")
            ) {
              throw e;
            }
            // Preserve original message if it seems like a specific key
            if (msg.includes(".")) throw e;
          }
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
          const res = await response.json();

          // Backend returns the mapped array directly
          if (!Array.isArray(res)) {
            if (res.error) throw new Error(res.error);
            throw new Error("apiErrors.invalidResponse");
          }

          // Map the response data to the required Kline interface
          return res.map(
            (kline: {
              open: string;
              high: string;
              low: string;
              close: string;
              vol?: string;
              timestamp?: number;
              time?: number;
              ts?: number;
            }) => ({
              open: new Decimal(kline.open),
              high: new Decimal(kline.high),
              low: new Decimal(kline.low),
              close: new Decimal(kline.close),
              volume: new Decimal(kline.vol || 0),
              // Backend sends 'timestamp', but we also fallback to 'time' or 'ts' just in case.
              // parseTimestamp handles seconds/milliseconds normalization.
              time: parseTimestamp(kline.timestamp || kline.time || kline.ts),
            })
          );
        } catch (e) {
          console.error(`fetchBitunixKlines error for ${symbol}:`, e);
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

          if (!data || !data.price) {
            throw new Error("apiErrors.invalidResponse");
          }
          return new Decimal(data.price);
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
          return data.map((kline: BinanceKline) => ({
            open: new Decimal(kline[1]),
            high: new Decimal(kline[2]),
            low: new Decimal(kline[3]),
            close: new Decimal(kline[4]),
            volume: new Decimal(kline[5]),
            time: parseTimestamp(kline[0]),
          }));
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
            const open = new Decimal(ticker.open);
            const last = new Decimal(ticker.lastPrice);

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
            if (!data || !data.lastPrice) {
              throw new Error("apiErrors.invalidResponse");
            }
            return {
              provider,
              symbol: normalized,
              lastPrice: new Decimal(data.lastPrice),
              highPrice: new Decimal(data.highPrice),
              lowPrice: new Decimal(data.lowPrice),
              volume: new Decimal(data.volume),
              quoteVolume: new Decimal(data.quoteVolume),
              priceChangePercent: new Decimal(data.priceChangePercent),
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
