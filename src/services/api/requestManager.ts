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
 * Global request orchestration (concurrency, dedup, cache,
 * per-venue rate limiters), extracted from apiService.ts (FEAT-0342).
 */

import { RequestDeduplicator } from "../../utils/requestDeduplicator";
import { RateLimiter } from "./rateLimiter";
import { ApiStatusError } from "./apiErrors";
import { apiQuotaTracker } from "../apiQuotaTracker.svelte";
import { logger } from "../logger";
import { getRequestTelemetrySink, isNetworkLoggingEnabled } from "./telemetry";

// --- Request Manager for Global Concurrency & Deduplication ---
class RequestManager {
  private pending = new RequestDeduplicator();
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
  private lastRateLimitLog = 0;

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

    if (removedCount > 0 && import.meta.env.DEV && isNetworkLoggingEnabled()) {
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

    // 1. & 2. Deduplication and Wrap in queue logic
    return (this.pending.execute(key, async () => {
      return new Promise<T>((resolve, reject) => {
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
            } catch (e: unknown) {
              if (e instanceof Error && e.name === "AbortError") {
                logger.warn("network", `[ReqMgr] Timeout for ${key}`);
              }
              if (attempt < retries) {
                const errorMsg =
                  e instanceof Error ? e.message.toLowerCase() : "";
                const is404 =
                  errorMsg.includes("404") || (e instanceof ApiStatusError && e.status === 404);
                const isSystemError = errorMsg.includes("system error");

                // DON'T retry on 404 (Not Found) or "System error" (invalid symbol for Bitunix)
                if (is404 || isSystemError) {
                  throw e;
                }

                if (isNetworkLoggingEnabled()) {
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
          getRequestTelemetrySink()?.recordApiCall();
          getRequestTelemetrySink()?.updateTelemetry({ apiLatency: latency });

          // Store in cache upon success (only if it matches the current request)
          // Prune before adding if full
          if (this.cache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
          }
          this.cache.set(key, { data: result, timestamp: Date.now() });

          if (isNetworkLoggingEnabled()) {
            logger.log("network", `[Response] Success: ${key}`);
          }
          resolve(result);
        } catch (e: unknown) {
          if (isNetworkLoggingEnabled()) {
            logger.error("network", `[Response] Failed: ${key}`, e);
          }

          // Enhanced error reporting with quota tracker integration
          const provider = (key.startsWith("BITUNIX") || key.includes("bitunix")) ? "bitunix" :
                           (key.startsWith("BITGET") || key.includes("bitget")) ? "bitget" : "unknown";

          if (provider !== "unknown") {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes("429") || msg.toLowerCase().includes("too many")) {
                  const now = Date.now();
                  if (now - this.lastRateLimitLog > 5000) {
                      logger.warn("api", `Rate limit hit for ${key}`, e);
                      this.lastRateLimitLog = now;
                  }
                  apiQuotaTracker.recordError(provider, "429");
              } else {
                  apiQuotaTracker.recordError(provider, msg);
              }
          }

          reject(e);
        } finally {
          this.activeCount--;
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
    }, (k) => {
      logger.debug("network", `[Dedupe] Joined: ${k}`);
    }) as Promise<unknown>) as Promise<T>;
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
