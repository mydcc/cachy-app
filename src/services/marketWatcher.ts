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
import { normalizeSymbol, mapTimeframeToBitunix } from "../utils/symbolUtils";
import { browser } from "$app/environment";
import { tradeState } from "../stores/trade.svelte";
import { logger } from "./logger";
import { storageService } from "./storageService";

interface MarketWatchRequest {
  symbol: string;
  channels: Set<string>; // "price", "ticker", "kline_1m", "kline_1h", etc.
}

class MarketWatcher {
  private requests = new Map<string, Map<string, number>>(); // symbol -> { channel -> count }
  private pollingInterval: any = null;
  private startTimeout: any = null; // Track startup delay

  // Phase 3 Hardening: Replaced Boolean Set locks with Promise Map for deduplication
  private pendingRequests = new Map<string, Promise<void>>();

  // Helper to store subscriptions intent
  private historyLocks = new Set<string>();

  private staggerTimeouts = new Set<any>(); // Track staggered requests to prevent zombie calls
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
      this.syncSubscriptions();

      // Trigger history sync for Klines
      if (channel.startsWith("kline_")) {
        const tf = channel.replace("kline_", "");
        this.ensureHistory(normSymbol, tf);
      }

      // Start polling for all channels (Price/Ticker/Kline)
      untrack(() => {
        const provider = settingsState.apiProvider;
        this.pollSymbolChannel(normSymbol, channel, provider);
      });
    }
  }

  /**
   * Unregister interest.
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
        this.syncSubscriptions();
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
        if (ch === "price") {
          bitunixChannel = "price";
        } else if (ch === "ticker") {
          bitunixChannel = "ticker";
        } else if (ch === "depth_book5") {
          bitunixChannel = "depth_book5";
        } else if (ch.startsWith("kline_")) {
          const timeframe = ch.replace("kline_", "");
          const bitunixInterval = mapTimeframeToBitunix(timeframe);
          bitunixChannel = `market_kline_${bitunixInterval}`;
        }
        const key = `${bitunixChannel}:${symbol}`;
        intended.set(key, { symbol, channel: bitunixChannel });
      });
    });

    // 2. Diff and Sync
    // Subscribe to additions
    intended.forEach((sub, key) => {
      if (!bitunixWs.pendingSubscriptions.has(key)) {
        bitunixWs.subscribe(sub.symbol, sub.channel);
      }
    });

    // Unsubscribe from removals
    bitunixWs.pendingSubscriptions.forEach((key: string) => {
      if (!intended.has(key)) {
        const [channel, symbol] = key.split(":");
        bitunixWs.unsubscribe(symbol, channel);
      }
    });
  }

  private startPolling() {
    this.stopPolling(); // Ensure clean state

    // Initial delay to avoid startup congestion
    this.startTimeout = setTimeout(() => {
      this.pollingInterval = setInterval(() => {
        // [HYBRID ARCHITECTURE CHANGE]
        // We no longer pause globally if WS is connected.
        // We run the cycle and let 'performPollingCycle' decide per-symbol.
        this.performPollingCycle();

        // Periodic Subscription Sync (Self-Healing)
        // Checks every 5 cycles (approx 5s) if WS subscriptions match requests
        if (Date.now() % 5000 < 1000) {
          this.syncSubscriptions();
        }
      }, 1000);
    }, 2000);
  }

  public stopPolling() {
    if (this.startTimeout) {
      clearTimeout(this.startTimeout);
      this.startTimeout = null;
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Clear pending stagger timeouts (Zombie Prevention)
    this.staggerTimeouts.forEach((t) => clearTimeout(t));
    this.staggerTimeouts.clear();

    // Clear locks
    this.pendingRequests.clear();
  }

  public resumePolling() {
    if (!this.pollingInterval) {
      this.startPolling();
    }
  }

  private async performPollingCycle() {
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
        if (!this.pollingInterval) return; // Zombie Guard
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
            let currentData = marketState.data[symbol]?.klines[tf] || [];
            let iterations = 0;
            const MAX_ITERATIONS = 30; // Safety cap (e.g. 30k candles max per session load)

            // Backfill Loop
            let oldestTime = klines1[0].time;

            while (limit > 1000 && currentData.length < limit && iterations < MAX_ITERATIONS) {
                iterations++;

                // Fetch older batch (before oldestTime)
                const olderKlines = await apiService.fetchBitunixKlines(symbol, tf, 1000, undefined, oldestTime);

                if (!olderKlines || olderKlines.length === 0) {
                    break; // No more history available
                }

                marketState.updateSymbolKlines(symbol, tf, olderKlines, "rest");
                storageService.saveKlines(symbol, tf, olderKlines);

                // Update state for next iteration
                currentData = marketState.data[symbol]?.klines[tf] || [];
                const newOldest = olderKlines[0].time;

                if (newOldest >= oldestTime) {
                    break;
                }
                oldestTime = newOldest;

                // Rate Limit Courtesy
                await new Promise(r => setTimeout(r, 100));
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
            // Determine priority: high for the main trading symbol, normal for the rest
            const isMainSymbol =
              tradeState.symbol &&
              normalizeSymbol(tradeState.symbol, "bitunix") === symbol;
            const priority = isMainSymbol ? "high" : "normal";

            // Hardening: Wrap API calls in strict timeout
            const timeoutMs = 10000;
            const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
              return Promise.race([
                promise,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs))
              ]);
            };

            if (channel === "price" || channel === "ticker") {
                const data = await withTimeout(apiService.fetchTicker24h(
                  symbol,
                  provider,
                  priority,
                ));
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
                const klines = await withTimeout(provider === "bitget"
                  ? apiService.fetchBitgetKlines(symbol, tf, 1000)
                  : apiService.fetchBitunixKlines(symbol, tf, 1000));

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
    logger.warn("market", "[MarketWatcher] Forced Cleanup Triggered");
  }
}

export const marketWatcher = new MarketWatcher();
