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

import { untrack } from "svelte";
import { bitunixWs } from "./bitunixWs";
import { apiService } from "./apiService";
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { browser } from "$app/environment";
import { tradeState } from "../stores/trade.svelte";
import { logger } from "./logger";
import { storageService } from "./storageService";

interface MarketWatchRequest {
  symbol: string;
  channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

function tfToMs(tf: string): number {
    const unit = tf.slice(-1);
    const val = parseInt(tf.slice(0, -1));
    if (isNaN(val)) return 60000;
    switch (unit) {
        case 'm': return val * 60 * 1000;
        case 'h': return val * 60 * 60 * 1000;
        case 'd': return val * 24 * 60 * 60 * 1000;
        case 'w': return val * 7 * 24 * 60 * 60 * 1000;
        case 'M': return val * 30 * 24 * 60 * 60 * 1000;
        default: return 60000;
    }
}

class MarketWatcher {
  private requests = new Map<string, Map<string, number>>(); // symbol -> { channel -> count }
  private isPolling = false;
  private pollingTimeout: ReturnType<typeof setTimeout> | null = null;
  private startTimeout: ReturnType<typeof setTimeout> | null = null; // Track startup delay

  // Phase 3 Hardening: Replaced Boolean Set locks with Promise Map for deduplication
  private pendingRequests = new Map<string, Promise<void>>();
  // Track start times for zombie detection
  private requestStartTimes = new Map<string, number>();
  // Performance: Batch subscription updates
  private _subscriptionsDirty = false;

  // Helper to store subscriptions intent
  private historyLocks = new Set<string>();

  private staggerTimeouts = new Set<ReturnType<typeof setTimeout>>(); // Track staggered requests to prevent zombie calls
  private maxConcurrentPolls = 6; // Reduced to mitigate rate limits (aligned with strict token bucket)
  private inFlight = 0;
  private lastErrorLog = 0;
  private readonly errorLogIntervalMs = 30000;

  constructor() {
    if (browser) {
      this.startPolling();
    }
  }

  /**
   * Register interest in a specific data channel for a symbol.
   * @param symbol Raw symbol
   * @param channel Channel name (e.g., "price", "kline_1h")
   */
  register(symbol: string, channel: string) {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");

    if (!this.requests.has(normSymbol)) {
      this.requests.set(normSymbol, new Map());
    }

    const channels = this.requests.get(normSymbol)!;
    const count = channels.get(channel) || 0;
    channels.set(channel, count + 1);

    // Only sync if this is the first requester for this channel
    if (count === 0) {
      this._subscriptionsDirty = true;

      // Trigger history sync for Klines
      if (channel.startsWith("kline_")) {
        const tf = channel.replace("kline_", "");
        this.ensureHistory(normSymbol, tf);
      }

      // Start polling for all channels (Price/Ticker/Kline)
      untrack(() => {
        const provider = settingsState.apiProvider;
        if (provider === "bitunix") {
             // Only subscribe to WS if using Bitunix
             if (channel === "price" || channel === "ticker") {
                 bitunixWs.subscribe(normSymbol, "ticker");
             } else if (channel.startsWith("kline_")) {
                 bitunixWs.subscribe(normSymbol, channel);
             }
        }
      });
    }
  }

  /**
   * Unregister interest in a channel.
   */
  unregister(symbol: string, channel: string) {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");
    const channels = this.requests.get(normSymbol);

    if (channels && channels.has(channel)) {
      const count = channels.get(channel)!;
      if (count <= 1) {
        channels.delete(channel);
        if (channels.size === 0) {
          this.requests.delete(normSymbol);
        }
        this._subscriptionsDirty = true;
      } else {
        channels.set(channel, count - 1);
      }
    }
  }

  private syncSubscriptions() {
    if (!browser) return;
    const settings = settingsState;
    // Only Bitunix has a WebSocket implementation currently.
    // If future providers get WS support, add them here.
    if (settings.apiProvider !== "bitunix") {
      // If we switched away from Bitunix, clear all WS subscriptions
      // Use pendingSubscriptions instead of publicSubscriptions
      Array.from(bitunixWs.pendingSubscriptions).forEach((key: string) => {
        const [channel, symbol] = key.split(":");
        bitunixWs.unsubscribe(symbol, channel);
      });
      return;
    }

    // 1. Collect all intended subscriptions from requests
    // map of key (channel:symbol) -> { symbol, channel }
    const intended = new Map<string, { symbol: string; channel: string }>();
    this.requests.forEach((channels, symbol) => {
      channels.forEach((_, ch) => {
        let bitunixChannel = ch;
        // Map generic "price" to Bitunix "ticker"
        if (ch === "price") bitunixChannel = "ticker";
        const key = `${bitunixChannel}:${symbol}`;
        intended.set(key, { symbol, channel: bitunixChannel });
      });
    });

    // 2. Unsubscribe from extras
    // Iterate over what is currently subscribed in WS service
    // We access the internal set via pendingSubscriptions to be safe
    const current = bitunixWs.pendingSubscriptions;
    current.forEach((key: string) => {
        if (!intended.has(key)) {
             const [channel, symbol] = key.split(":");
             bitunixWs.unsubscribe(symbol, channel);
        }
    });

    // 3. Subscribe to missing
    intended.forEach(({ symbol, channel }, key) => {
        if (!current.has(key)) {
             bitunixWs.subscribe(symbol, channel);
        }
    });
  }

  // Zombie Request Pruning (Self-Correction)
  private pruneZombieRequests() {
    const now = Date.now();
    const timeout = 20000; // 20s hard limit for HTTP requests
    this.requestStartTimes.forEach((start, key) => {
        if (now - start > timeout) {
            logger.warn("market", `[MarketWatcher] Detected zombie request for ${key}. Removing lock.`);
            this.pendingRequests.delete(key);
            this.requestStartTimes.delete(key);
            // Decrease inFlight count if it was counted
            // Since we don't know for sure if it finished or hung, we decrement carefully
            this.inFlight = Math.max(0, this.inFlight - 1);
        }
    });
  }

  public startPolling() {
    if (this.isPolling) return;
    this.stopPolling(); // Ensure clean state
    this.isPolling = true;

    // Initial delay to avoid startup congestion
    this.startTimeout = setTimeout(() => {
      this.runPollingLoop();
    }, 2000);
  }

  private async runPollingLoop() {
    if (!this.isPolling) return;

    try {
      // [HYBRID ARCHITECTURE CHANGE]
      // We no longer pause globally if WS is connected.
      // We run the cycle and let 'performPollingCycle' decide per-symbol.
      await this.performPollingCycle();

      // [PERFORMANCE] Only sync if dirty (Batched updates)
      if (this._subscriptionsDirty) {
        this.syncSubscriptions();
        this._subscriptionsDirty = false;
      }
    } catch (e) {
      logger.error("market", "Polling loop error", e);
    }

    if (this.isPolling) {
      this.pollingTimeout = setTimeout(() => this.runPollingLoop(), 1000);
    }
  }

  public stopPolling() {
    this.isPolling = false;
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = null;
    }
    // Also clear stagger timeouts
    this.staggerTimeouts.forEach(id => clearTimeout(id));
    this.staggerTimeouts.clear();
  }

  private async performPollingCycle() {
    this.pruneZombieRequests();

    const settings = settingsState;
    const provider = settings.apiProvider;

    const allowed = Math.max(this.maxConcurrentPolls - this.inFlight, 0);
    if (allowed <= 0) return;

    const tasks: Array<{ symbol: string; channel: string; lockKey: string }> = [];

    this.requests.forEach((channels, symbol) => {
      // [HYBRID] Gap Detection
      // Check if we have recent data for this symbol from WS
      const data = marketState.data[symbol];
      const now = Date.now();
      const lastUpdate = data?.lastUpdated || 0;
      const isStale = (now - lastUpdate) > 10000; // 10s Gap Threshold
      const isWsConnected = marketState.connectionStatus === "connected";

      // If WS is connected AND data is fresh, we skip polling (Pure WebSocket Mode)
      // If WS is disconnected OR data is stale (Gap), we Poll (REST Fallback)
      if (isWsConnected && !isStale) {
        return;
      }

      channels.forEach((_, channel) => {
        const lockKey = `${symbol}:${channel}`;
        // Skip if already in flight (Deduplication)
        if (this.pendingRequests.has(lockKey)) return;
        tasks.push({ symbol, channel, lockKey });
      });
    });

    if (tasks.length === 0) return;

    const scheduleCount = Math.min(allowed, tasks.length);

    // Spread out requests over the first cycle to avoid burst
    let stagger = 0;
    for (let i = 0; i < scheduleCount; i++) {
      const { symbol, channel } = tasks[i];
      const currentStagger = stagger;
      stagger += Math.floor(Math.random() * 150) + 50; // Random 50-200ms increments

      const timeoutId = setTimeout(() => {
        this.staggerTimeouts.delete(timeoutId);
        if (!this.isPolling) return; // Zombie Guard
        if (this.inFlight >= this.maxConcurrentPolls) return;

        // Final dedupe check inside timeout
        const lockKey = `${symbol}:${channel}`;
        if (!this.pendingRequests.has(lockKey)) {
          this.pollSymbolChannel(symbol, channel, provider);
        }
      }, currentStagger);
      this.staggerTimeouts.add(timeoutId);
    }
  }

  public async ensureHistory(symbol: string, tf: string) {
    const provider = settingsState.apiProvider;
    if (provider !== "bitunix") return;

    const lockKey = `${symbol}:${tf}`;
    if (this.historyLocks.has(lockKey)) {
        return;
    }
    this.historyLocks.add(lockKey);

    try {
        // 1. Try Load from DB
        const stored = await storageService.getKlines(symbol, tf);
        if (stored && stored.length > 0) {
            marketState.updateSymbolKlines(symbol, tf, stored, "rest");
        }

        // 2. Determine if we need to fetch
        const limit = settingsState.chartHistoryLimit || 1000;

        // Execute Fetch Logic
        const latestLimit = 1000; // API Max
        const klines1 = await apiService.fetchBitunixKlines(symbol, tf, latestLimit);

        if (klines1 && klines1.length > 0) {
            marketState.updateSymbolKlines(symbol, tf, klines1, "rest");
            storageService.saveKlines(symbol, tf, klines1); // Async save

            // Check if we have enough history now
            const currentLen = klines1.length;

            // Optimization: Parallel Backfill
            if (currentLen < limit) {
                const remaining = limit - currentLen;
                const batchSize = 1000;
                const batchesNeeded = Math.ceil(remaining / batchSize);
                // Cap batches to avoid crazy fetch storms (e.g. max 10 batches = 10k candles)
                const effectiveBatches = Math.min(batchesNeeded, 10);

                if (effectiveBatches > 0) {
                    const oldestTime = klines1[0].time;
                    const intervalMs = tfToMs(tf);

                    const results: any[] = [];
                    // Throttling: Process in chunks of 3 to avoid saturating RequestManager (Max 8)
                    // This ensures real-time polling (high priority) and other requests have breathing room.
                    const concurrency = 3;

                    for (let i = 0; i < effectiveBatches; i += concurrency) {
                        if (!this.isPolling) {
                             logger.debug("market", `[History] Polling stopped, aborting backfill for ${symbol}`);
                             break;
                        }

                        const chunkTasks: Promise<any>[] = [];
                        for (let j = 0; j < concurrency && i + j < effectiveBatches; j++) {
                             const batchIdx = i + j;
                             const batchEndTime = oldestTime - (batchIdx * batchSize * intervalMs);

                             chunkTasks.push(
                                 apiService.fetchBitunixKlines(symbol, tf, batchSize, undefined, batchEndTime)
                                     .catch(e => {
                                         logger.warn("market", `[History] Backfill batch ${batchIdx} failed`, e);
                                         return [];
                                     })
                             );
                        }

                        const chunkResults = await Promise.all(chunkTasks);
                        results.push(...chunkResults);
                    }

                    if (!this.isPolling) {
                         return;
                    }

                    // Flatten and process
                    const allBackfilled = results.flat();
                    if (allBackfilled.length > 0) {
                        marketState.updateSymbolKlines(symbol, tf, allBackfilled, "rest");
                        storageService.saveKlines(symbol, tf, allBackfilled);
                    }
                }
            }
        }
    } catch (e) {
        logger.warn("market", `[History] Error ensuring history for ${symbol}`, e);
    } finally {
        this.historyLocks.delete(lockKey);
    }
  }

  public async loadMoreHistory(symbol: string, tf: string): Promise<boolean> {
    const lockKey = `more:${symbol}:${tf}`;
    if (this.historyLocks.has(lockKey)) return false; // Already loading

    // Check global lock to avoid colliding with ensureHistory
    const globalLock = `${symbol}:${tf}`;
    if (this.historyLocks.has(globalLock)) return false;

    this.historyLocks.add(lockKey);

    try {
        const data = marketState.data[symbol];
        if (!data || !data.klines || !data.klines[tf] || data.klines[tf].length === 0) {
            return false;
        }

        const history = data.klines[tf];
        // Ensure sorted
        const oldestTime = history[0].time;

        // Fetch older batch (Bitunix specific)
        const newKlines = await apiService.fetchBitunixKlines(symbol, tf, 1000, undefined, oldestTime);

        if (newKlines && newKlines.length > 0) {
            marketState.updateSymbolKlines(symbol, tf, newKlines, "rest", false);
            return true;
        }
        return false;
    } catch (e) {
        logger.warn("market", `[History] Error loading more history for ${symbol}`, e);
        return false;
    } finally {
        this.historyLocks.delete(lockKey);
    }
  }

  private async pollSymbolChannel(
    symbol: string,
    channel: string,
    provider: "bitunix" | "bitget",
  ) {
    if (!settingsState.capabilities.marketData) return;
    const lockKey = `${symbol}:${channel}`;

    // Request Deduplication
    if (this.pendingRequests.has(lockKey)) {
        return this.pendingRequests.get(lockKey);
    }

    this.inFlight++;

    // Create the Promise wrapper
    const requestPromise = (async () => {
        try {
            this.requestStartTimes.set(lockKey, Date.now());
            // Determine priority: high for the main trading symbol, normal for the rest
            const isMainSymbol =
              tradeState.symbol &&
              normalizeSymbol(tradeState.symbol, "bitunix") === symbol;
            const priority = isMainSymbol ? "high" : "normal";

            // Hardening: Wrap API calls in strict timeout
            const timeoutMs = 10000;
            // Removed redundant withTimeout wrapper which caused memory leaks.
            // apiService handles timeout internally.

            if (channel === "price" || channel === "ticker") {
                const data = await apiService.fetchTicker24h(
                  symbol,
                  provider,
                  priority,
                  timeoutMs
                );
                marketState.updateSymbol(symbol, {
                  lastPrice: data.lastPrice,
                  highPrice: data.highPrice,
                  lowPrice: data.lowPrice,
                  volume: data.volume,
                  priceChangePercent: data.priceChangePercent,
                  quoteVolume: data.quoteVolume,
                });
            } else if (channel.startsWith("kline_")) {
                const tf = channel.replace("kline_", "");
                const klines = await (provider === "bitget"
                  ? apiService.fetchBitgetKlines(symbol, tf, 1000, undefined, undefined, "normal", timeoutMs)
                  : apiService.fetchBitunixKlines(symbol, tf, 1000, undefined, undefined, "normal", timeoutMs));

                if (klines && klines.length > 0) {
                  marketState.updateSymbolKlines(symbol, tf, klines, "rest");
                  storageService.saveKlines(symbol, tf, klines);
                }
            }
        } catch (e) {
            const now = Date.now();
            if (now - this.lastErrorLog > this.errorLogIntervalMs) {
                logger.warn("market", `[MarketWatcher] Polling error for ${symbol}/${channel}`, e);
                this.lastErrorLog = now;
            }
        } finally {
            // Release lock immediately
            this.pendingRequests.delete(lockKey);
            this.requestStartTimes.delete(lockKey);
            this.inFlight = Math.max(0, this.inFlight - 1);
        }
    })();

    // Store the promise
    this.pendingRequests.set(lockKey, requestPromise);
    return requestPromise;
  }

  public getActiveSymbols(): string[] {
    return Array.from(this.requests.keys());
  }

  // Safety valve: Force cleanup
  public forceCleanup() {
    this.requests.clear();
    this.pendingRequests.clear();
    this.inFlight = 0;
    this.syncSubscriptions();
    this._subscriptionsDirty = false;
    logger.warn("market", "[MarketWatcher] Forced Cleanup Triggered");
  }
}

export const marketWatcher = new MarketWatcher();
