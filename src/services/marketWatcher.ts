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
import { activeTechnicalsManager } from "./activeTechnicalsManager.svelte";
import { getChannelsForRequirement } from "../types/dataRequirements";
import { safeTfToMs } from "../utils/timeUtils";
import { Decimal } from "decimal.js";
import { KlineRawSchema, type KlineRaw, type Kline } from "./technicalsTypes";
import { idleMonitor } from "../utils/idleMonitor.svelte";


interface MarketWatchRequest {
  symbol: string;
  channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

class MarketWatcher {
  // Optimization: Module-level constant to reduce allocation
  private static readonly ZERO_VOL = new Decimal(0);

  private requests = new Map<string, Map<string, Map<string, number>>>(); // symbol -> { channel -> { requirement -> count } }
  private isPolling = false;
  private pollingTimeout: ReturnType<typeof setTimeout> | null = null;
  private startTimeout: ReturnType<typeof setTimeout> | null = null; // Track startup delay

  // Phase 3 Hardening: Replaced Boolean Set locks with Promise Map for deduplication
  private pendingRequests = new Map<string, Promise<void>>();
  // Track start times for zombie detection
  private requestStartTimes = new Map<string, number>();
  
  // Track symbol:timeframe pairs that have reached broker limits
  private exhaustedHistory = new Set<string>();
  // Performance: Batch subscription updates
  private _subscriptionsDirty = false;

  // Helper to store subscriptions intent
  private historyLocks = new Set<string>();

  // Track pruned requests to prevent double-decrement of inFlight
  private prunedRequestIds = new Set<string>();

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
  register(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");

    if (!this.requests.has(normSymbol)) {
      this.requests.set(normSymbol, new Map());
    }

    const channels = this.requests.get(normSymbol)!;
    if (!channels.has(channel)) {
      channels.set(channel, new Map());
    }

    const reqs = channels.get(channel)!;
    const count = reqs.get(requirement) || 0;
    reqs.set(requirement, count + 1);

    const totalChannelCount = Array.from(reqs.values()).reduce((a, b) => a + b, 0);

    // Only sync if this is the first requester for this channel globally
    if (totalChannelCount === 1) {
      this._subscriptionsDirty = true;
      // Start polling/WS immediately
      this.syncChannelSubscription(normSymbol, channel);
    }

    // GATED HISTORY: Only trigger deep history if requirement is 'chart'
    if (requirement === "chart" && channel.startsWith("kline_")) {
      const tf = channel.replace("kline_", "");
      this.ensureHistory(normSymbol, tf);
    } else if (requirement === "stateless" && channel.startsWith("kline_")) {
        const tf = channel.replace("kline_", "");
        // Request shallow history (e.g. 100 candles) for technicals calculation
        this.ensureShallowHistory(normSymbol, tf);
    }
  }

  /**
   * Unregister interest in a channel.
   */
  unregister(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {
    if (!symbol) return;
    const normSymbol = normalizeSymbol(symbol, "bitunix");
    const channels = this.requests.get(normSymbol);

    if (channels && channels.has(channel)) {
      const reqs = channels.get(channel)!;
      const count = reqs.get(requirement);

      if (count && count > 0) {
        if (count === 1) {
          reqs.delete(requirement);
        } else {
          reqs.set(requirement, count - 1);
        }
      }

      if (reqs.size === 0) {
        channels.delete(channel);
        if (channels.size === 0) {
          this.requests.delete(normSymbol);
        }
        this._subscriptionsDirty = true;
      }
    }
  }

  private syncChannelSubscription(symbol: string, channel: string) {
    untrack(() => {
        const provider = settingsState.apiProvider;
        if (provider === "bitunix") {
             const wsChannels = getChannelsForRequirement(channel);
             wsChannels.forEach(ch => {
               bitunixWs.subscribe(symbol, ch);
             });
             
             // Legacy
             if (channel === "price") bitunixWs.subscribe(symbol, "price");
             else if (channel === "ticker") bitunixWs.subscribe(symbol, "ticker");
             else if (channel.startsWith("kline_")) bitunixWs.subscribe(symbol, channel);
        }
      });
  }

  private syncSubscriptions() {
    if (!browser) return;
    const settings = settingsState;
    // Only Bitunix has a WebSocket implementation currently.
    // If future providers get WS support, add them here.
    if (settings.apiProvider !== "bitunix") {
      // If we switched away from Bitunix, clear all WS subscriptions
      // Use pendingSubscriptions instead of publicSubscriptions
      Array.from(bitunixWs.pendingSubscriptions.keys()).forEach((key: string) => {
        const [channel, symbol] = key.split(":");
        bitunixWs.unsubscribe(symbol, channel);
      });
      return;
    }

    // 1. Collect all intended subscriptions from requests
    // map of key (channel:symbol) -> { symbol, channel }
    const intended = new Map<string, { symbol: string; channel: string }>();
    this.requests.forEach((channels, symbol) => {
      channels.forEach((reqs, ch) => {
        const bitunixChannel = ch;
        // No longer map generic "price" to Bitunix "ticker" - let "price" be "price" (mark price + funding)
        const key = `${bitunixChannel}:${symbol}`;
        intended.set(key, { symbol, channel: bitunixChannel });
      });
    });

    // 2. Unsubscribe from extras
    // Iterate over what is currently subscribed in WS service
    // We access the internal set via pendingSubscriptions to be safe
    const current = bitunixWs.pendingSubscriptions;
    current.forEach((_, key) => {
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
  // Generation counter to identify stale requests
  private requestGenerations = new Map<string, number>();

  private pruneZombieRequests() {
    const now = Date.now();
    const timeout = 20000; // 20s hard limit for HTTP requests

    // We iterate a copy of keys to avoid modification during iteration issues
    const keys = Array.from(this.requestStartTimes.keys());

    for (const key of keys) {
        const start = this.requestStartTimes.get(key) || 0;
        if (now - start > timeout) {
            logger.warn("market", `[MarketWatcher] Detected zombie request for ${key}. Removing lock.`);
            this.pendingRequests.delete(key);
            this.requestStartTimes.delete(key);

            // Critical fix: Increment generation to invalidate the old request
            // If the old request eventually returns, it will check the generation and abort
            const gen = this.requestGenerations.get(key) || 0;
            this.requestGenerations.set(key, gen + 1);

            // Decrease inFlight count if it was counted
            this.inFlight = Math.max(0, this.inFlight - 1);

            // Mark as pruned so the finally block doesn't decrement again
            this.prunedRequestIds.add(key);
        }
    }
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

  // Alias for ConnectionManager interface
  public resumePolling() {
    this.startPolling();
  }

  private pruneOrphanedSubscriptions() {
    for (const [symbol, channels] of this.requests) {
      for (const [channel, reqs] of channels) {
        if (reqs.size === 0) {
          channels.delete(channel);
          this._subscriptionsDirty = true;
        } else {
          for (const [req, count] of reqs) {
            if (count <= 0) {
              reqs.delete(req);
              this._subscriptionsDirty = true;
            }
          }
          if (reqs.size === 0) {
            channels.delete(channel);
            this._subscriptionsDirty = true;
          }
        }
      }
      if (channels.size === 0) {
        this.requests.delete(symbol);
        this._subscriptionsDirty = true;
      }
    }
  }

  private async runPollingLoop() {
    if (!this.isPolling) return;

    // [IDLE OPTIMIZATION]
    // If hidden, run very slowly (10s)
    // If idle, run slowly (5s)
    // Normal: 1s
    let nextTick = 1000;

    if (typeof document !== 'undefined' && document.hidden) {
        nextTick = 10000;
    } else if (idleMonitor.isUserIdle) {
        nextTick = 5000;
    }

    try {
      // [HYBRID ARCHITECTURE CHANGE]
      // We no longer pause globally if WS is connected.
      // We run the cycle and let 'performPollingCycle' decide per-symbol.
      await this.performPollingCycle();

      // [MAINTENANCE] Prune orphaned subscriptions every 30s
      if (Date.now() % 30000 < 1000) {
        this.pruneOrphanedSubscriptions();
      }


      // [PERFORMANCE] Only sync if dirty (Batched updates)
      if (this._subscriptionsDirty) {
        this.syncSubscriptions();
        this._subscriptionsDirty = false;
      } else {
        // [HARDENING] Periodic forced sync/prune to prevent drift (every ~30s)
        const now = Date.now();
        if (now % 30000 < 1000) {
            this.pruneOrphanedSubscriptions();
        }
      }
    } catch (e) {
      logger.error("market", "Polling loop error", e);
    }

    if (this.isPolling) {
      this.pollingTimeout = setTimeout(() => this.runPollingLoop(), nextTick);
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

  public async ensureShallowHistory(symbol: string, tf: string): Promise<boolean> {
      const provider = settingsState.apiProvider;
      if (provider !== "bitunix") return false;

      const lockKey = `${symbol}:${tf}:shallow`;
      if (this.historyLocks.has(lockKey) || this.exhaustedHistory.has(`${symbol}:${tf}`)) {
          return true;
      }
      this.historyLocks.add(lockKey);

      let shouldRefresh = false;

      try {
          const currentData = marketState.data[symbol]?.klines[tf] || [];
          if (currentData.length >= 250) return true; // Already have enough for basic technicals

           // Fetch small batch
          const limit = 300;
          const klines = await apiService.fetchBitunixKlines(symbol, tf, limit, undefined, Date.now());

          if (klines && klines.length > 0) {
              const filled = this.fillGaps(klines, safeTfToMs(tf));
              marketState.updateSymbolKlines(symbol, tf, filled, "rest");
              shouldRefresh = true;
          }
          return true;
      } catch (e) {
          logger.warn("market", `[History] Shallow fetch failed for ${symbol}:${tf}`, e);
          return false;
      } finally {
          this.historyLocks.delete(lockKey);
          if (shouldRefresh) {
               // FORCE REFRESH TECHNICALS (Now that lock is released)
              activeTechnicalsManager.forceRefresh(symbol, tf);
          }
      }
  }

  public async ensureHistory(symbol: string, tf: string): Promise<boolean> {
    const provider = settingsState.apiProvider;
    if (provider !== "bitunix") return false;

    const lockKey = `${symbol}:${tf}`;
    if (this.historyLocks.has(lockKey)) {
        return true; // Already loading
    }
    this.historyLocks.add(lockKey);

    try {
        // 1. Try Load from DB
        const stored = await storageService.getKlines(symbol, tf);
        if (stored && stored.length > 0) {
            marketState.updateSymbolKlines(symbol, tf, stored, "rest");
        }

        // 2. Check current store state and exhaustion to avoid redundant backfills
        const currentData = marketState.data[symbol]?.klines[tf] || [];
        const limit = settingsState.chartHistoryLimit || 1000;
        const exhaustKey = `${symbol}:${tf}`;

        if (currentData.length >= limit || this.exhaustedHistory.has(exhaustKey)) {
            return false; // No more to fetch
        }

        // 3. Execute Fetch Logic
        const initialLimit = 200; 
        let klines1 = await apiService.fetchBitunixKlines(symbol, tf, initialLimit, undefined, Date.now());

        if (klines1) {
            klines1 = klines1.filter(k => k && typeof k.time === 'number' && !isNaN(k.time));
        }

        if (klines1 && klines1.length > 0) {
            // Apply fillGaps to initial batch
            const filled1 = this.fillGaps(klines1, safeTfToMs(tf));
            marketState.updateSymbolKlines(symbol, tf, filled1, "rest");
            storageService.saveKlines(symbol, tf, filled1); // Async save

            // Check if we have enough history now
            const currentLen = klines1.length;
            if (import.meta.env.DEV && (tf === '15m' || tf === '30m')) {
                logger.log("market", `[History] ensureHistory ${symbol}:${tf} fetched ${currentLen} initial candles.`);
            }

            // Sequential Backfill (Hardened for Bitunix 200-candle limit)
            if (currentLen < limit) {
                const batchSize = 200; 
                // Source of truth: store count
                let currentTotal = marketState.data[symbol]?.klines[tf]?.length || klines1.length;
                let lastOldestTime = klines1[0].time;
                
                // BACKFILL OPTIMIZATION: Batch store updates to prevent technicals-restart-spam
                let backfillBuffer: Kline[] = []; // Typed for Decimal
                const storeUpdateThreshold = 10; // Update store every 10 batches (2000 candles)
                let batchesSubSinceUpdate = 0;

                const storeCount = marketState.data[symbol]?.klines[tf]?.length || 0;
                logger.log("market", `[History] Starting sequential backfill for ${symbol}:${tf}. Target: ${limit}. Store: ${storeCount}.`);

                for (let i = 0; i < 250; i++) { // Max 250 batches
                    if (currentTotal >= limit) {
                        this.exhaustedHistory.add(exhaustKey);
                        break;
                    }
                    // Sequential backfill is independent of price polling

                    const batchEndTime = lastOldestTime - 1;
                    let batch: Kline[] = [];
                    let retryCount = 0;
                    const maxRetries = 2;

                    while (retryCount <= maxRetries) {
                        try {
                            // Backfill should use startTime=1 to ensure data is returned for the requested range
                            batch = await apiService.fetchBitunixKlines(symbol, tf, batchSize, 1, batchEndTime);
                            break; 
                        } catch (e) {
                            retryCount++;
                            if (retryCount > maxRetries) {
                                logger.warn("market", `[History] Backfill batch ${i} permanently failed for ${symbol}:${tf}`);
                                break;
                            }
                            const delay = 1000 * retryCount;
                            await new Promise(r => setTimeout(r, delay));
                        }
                    }

                    if (!batch || batch.length === 0) {
                        logger.log("market", `[History] Backfill reached end of history for ${symbol}:${tf} at Iter ${i} (${currentTotal}/${limit} candles).`);
                        this.exhaustedHistory.add(exhaustKey);
                        break;
                    }
                    
                    if (import.meta.env.DEV && (tf === '1h')) {
                        logger.debug("market", `[History] Iter ${i} success. Got ${batch.length} candles. Newest: ${batch[batch.length-1].time}, Oldest: ${batch[0].time}`);
                    }

                    // Success: Buffer for batch update
                    // Apply fillGaps to the batch before pushing to buffer
                    const filledBatch = this.fillGaps(batch, safeTfToMs(tf));
                    backfillBuffer.push(...filledBatch);
                    batchesSubSinceUpdate++;
                    
                    // Update counters for next iteration
                    currentTotal += batch.length;
                    lastOldestTime = batch[0].time;

                    // Periodically flush buffer to store
                    if (batchesSubSinceUpdate >= storeUpdateThreshold) {
                        const countBefore = marketState.data[symbol]?.klines[tf]?.length || 0;
                        marketState.updateSymbolKlines(symbol, tf, backfillBuffer, "rest");
                        const countAfter = marketState.data[symbol]?.klines[tf]?.length || 0;
                        
                        logger.log("market", `[History] Backfill Flush: Added ${backfillBuffer.length} raw. Store: ${countBefore} -> ${countAfter}. Iter ${i}/${limit}.`);
                        
                        backfillBuffer = [];
                        batchesSubSinceUpdate = 0;
                    }
                }

                // Final flush
                if (backfillBuffer.length > 0) {
                    marketState.updateSymbolKlines(symbol, tf, backfillBuffer, "rest");
                }
                
                // FORCE FINAL CALCULATION
                activeTechnicalsManager.forceRefresh(symbol, tf);
            }
        }
        return true;
    } catch (e) {
        logger.error("market", `[History] Unexpected error in ensureHistory for ${symbol}:${tf}`, e);
        return false;
    } finally {
        this.historyLocks.delete(lockKey);
    }
  }

  // Helper to fill gaps in candle data to preserve time-series integrity for indicators
  private fillGaps(klines: Kline[], intervalMs: number): Kline[] {
      if (!klines || klines.length < 2) return klines || [];

      // Validating Decimal presence
      if (klines[0] && !(klines[0].open instanceof Decimal)) {
          // Fallback if somehow not Decimal, though types suggest it is.
          // In strict TS, this check might not be needed if typed correctly, but for runtime safety:
          return klines;
      }

      // Optimization: Fast scan for gaps to avoid allocation in happy path (99% of cases)
      let hasGaps = false;
      const threshold = intervalMs * 1.1;

      for (let i = 1; i < klines.length; i++) {
          // Simple subtraction check is much cheaper than object allocation
          if (klines[i].time - klines[i-1].time > threshold) {
              hasGaps = true;
              break;
          }
      }

      if (!hasGaps) {
          return klines;
      }

      // Optimized single-pass gap filling
      const result: Kline[] = [];
      // Heuristic: Pre-allocate a bit more space if gaps are expected?
      // V8 handles array growth well, but we can avoid resizing for small gaps.
      // However, we do not know total size without a pass. Just use standard push.

      let prev = klines[0];
      result.push(prev);

      const MAX_GAP_FILL = 5000;

      for (let i = 1; i < klines.length; i++) {
          const curr = klines[i];

          // Hardening: Basic structural check for current item
          if (!curr || typeof curr.time !== "number") continue;

          const diff = curr.time - prev.time;
          if (diff > threshold) {
               // Calculate missing candles
               // Example: T=0, T=3. Diff=3. Interval=1. 3/1 - 1 = 2 missing (T+1, T+2).
               const gapCount = Math.floor(diff / intervalMs) - 1;

               if (gapCount > 0) {
                   const fillCount = Math.min(gapCount, MAX_GAP_FILL);

                   if (gapCount >= MAX_GAP_FILL) {
                       logger.error("market", `[fillGaps] CRITICAL: Max gap fill limit reached (${MAX_GAP_FILL}) for candle interval ${intervalMs}. Data discontinuity possible.`);
                   }

                   const fillClose = prev.close; // Reuse Decimal reference
                   let nextTime = prev.time + intervalMs;

                   for (let j = 0; j < fillCount; j++) {
                       result.push({
                           time: nextTime,
                           open: fillClose,
                           high: fillClose,
                           low: fillClose,
                           close: fillClose,
                           volume: MarketWatcher.ZERO_VOL
                       });
                       nextTime += intervalMs;
                   }
               }
          }
          result.push(curr);
          prev = curr;
      }
      return result;
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

        logger.debug("market", `[History] loadMoreHistory for ${symbol}:${tf}. Oldest: ${oldestTime}`);

        // Fetch older batch (Bitunix specific)
        // Use -1 to ensure we get data strictly BEFORE the current oldest
        const newKlines = await apiService.fetchBitunixKlines(symbol, tf, 200, undefined, oldestTime - 1);

        if (newKlines && newKlines.length > 0) {
            const filled = this.fillGaps(newKlines, safeTfToMs(tf));
            marketState.updateSymbolKlines(symbol, tf, filled, "rest", false);
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

    // Track generation for this request
    const currentGen = (this.requestGenerations.get(lockKey) || 0) + 1;
    this.requestGenerations.set(lockKey, currentGen);

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
                  const filled = this.fillGaps(klines, safeTfToMs(tf));
                  marketState.updateSymbolKlines(symbol, tf, filled, "rest");
                  storageService.saveKlines(symbol, tf, filled);
                }
            }
        } catch (e) {
            const now = Date.now();
            if (now - this.lastErrorLog > this.errorLogIntervalMs) {
                logger.warn("market", `[MarketWatcher] Polling error for ${symbol}/${channel}`, e);
                this.lastErrorLog = now;
            }
        } finally {
            // Check generation to prevent zombie race condition
            // If generation has changed, it means this request was already pruned/superceded
            const latestGen = this.requestGenerations.get(lockKey) || 0;

            if (latestGen === currentGen) {
                // This is still the active request
                this.pendingRequests.delete(lockKey);
                this.requestStartTimes.delete(lockKey);
                this.inFlight = Math.max(0, this.inFlight - 1);
            } else {
                // This request was marked as zombie/pruned. Do NOT decrement inFlight.
                // Log debug if needed
                if (import.meta.env.DEV) {
                    console.debug(`[MarketWatcher] Zombie request finished late for ${lockKey} (Gen ${currentGen} vs ${latestGen}). Ignored.`);
                }
            }

            // Cleanup pruned ID if present (legacy check, but generation check covers it)
            this.prunedRequestIds.delete(lockKey);
        }
    })();

    // Store the promise
    this.pendingRequests.set(lockKey, requestPromise);
    return requestPromise;
  }

  public refreshActiveHistory() {
    this.requests.forEach((channels, symbol) => {
      channels.forEach((reqs, channel) => {
        if (channel.startsWith("kline_") && reqs.has("chart")) {
          const tf = channel.replace("kline_", "");
          this.ensureHistory(symbol, tf);
        }
      });
    });
  }

  public getActiveSymbols(): string[] {
    return Array.from(this.requests.keys());
  }

  /**
   * Check if history is currently being loaded (backfilled) for a symbol/timeframe.
   */
  public isBackfilling(symbol: string, tf: string): boolean {
    return this.historyLocks.has(`${symbol}:${tf}`);
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
