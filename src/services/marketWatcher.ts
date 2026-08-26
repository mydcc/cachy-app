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

import { SubscriptionRegistry } from "./marketWatcher/subscriptionRegistry";
import { HistoryFetcher, type LoadMoreHistoryResult } from "./marketWatcher/historyFetcher";
import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { logger } from "./logger";
import { type Kline } from "./technicalsTypes";

export class MarketWatcher {
    private registry!: SubscriptionRegistry;
    private historyFetcher!: HistoryFetcher;
    private isPolling: boolean = false;
    private pollingTimeout: ReturnType<typeof setTimeout> | null = null;
    private startTimeout: ReturnType<typeof setTimeout> | null = null;
    private staggerTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();
    private maxConcurrentPolls: number = 6;
    private maintenanceCycles: number = 0;

    constructor() {
        this.registry = new SubscriptionRegistry(null as unknown as HistoryFetcher);
        this.historyFetcher = new HistoryFetcher(this.registry);
        this.registry.historyFetcher = this.historyFetcher;
    }

    public startPolling() {
        if (this.isPolling) return;
        this.stopPolling();
        this.isPolling = true;
        this.startTimeout = setTimeout(() => {
          this.runPollingLoop();
        }, 2000);
    }

    public resumePolling() {
        this.startPolling();
    }

    /**
     * Force an immediate reconciliation of desired subscriptions (`this.registry.requests`,
     * the watcher's own source of truth) against the live provider connection.
     * Called by ConnectionManager right after a provider reports a successful
     * (re)connect: the provider's subscription buffer is wiped on every
     * destroy()/connect() cycle, so without an explicit resync here, tiles can
     * end up subscribed to nothing after a reconnect even though `this.registry.requests`
     * still lists them as wanted.
     */
    public resync() {
        this.registry._subscriptionsDirty = false;
        this.syncSubscriptions();
    }

    /**
     * ConnectionManager has destroyed every provider, so the sockets hold
     * nothing regardless of what the ledger last issued (FEAT-0227). The
     * following `resync` therefore re-subscribes everything still wanted.
     *
     * Before FEAT-0227 the same fact was discovered by reading the venue
     * socket's internal subscription map from `subscriptionRegistry`, which
     * is why that file had to know Bitunix was the special one.
     */
    public forgetSubscriptions() {
        this.registry.forgetIssuedSubscriptions();
    }

    private async runPollingLoop() {
        if (!this.isPolling) return;
        try {
          // [HYBRID ARCHITECTURE CHANGE]
          // We no longer pause globally if WS is connected.
          // We run the cycle and let 'performPollingCycle' decide per-symbol.
          await this.performPollingCycle();

          // [MAINTENANCE] Prune orphaned subscriptions every ~30 cycles
          this.maintenanceCycles++;
          if (this.maintenanceCycles >= 30) {
            this.registry.pruneOrphanedSubscriptions();
            this.maintenanceCycles = 0;
          }

          // [PERFORMANCE] Only sync if dirty (Batched updates)
          if (this.registry._subscriptionsDirty) {
            this.syncSubscriptions();
            this.registry._subscriptionsDirty = false;
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

        this.staggerTimeouts.forEach(id => clearTimeout(id));
        this.staggerTimeouts.clear();
    }

    private async performPollingCycle() {
        this.registry.pruneZombieRequests();
        const settings = settingsState;
        const provider = settings.apiProvider;
        const allowed = Math.max(this.maxConcurrentPolls - this.historyFetcher.inFlight, 0);
        if (allowed <= 0) return;
        const tasks: Array<{ symbol: string; channel: string; lockKey: string }> = [];
        this.registry.requests.forEach((channels, symbol) => {
          // [HYBRID] Gap Detection
          // Check if we have recent data for this symbol from WS
          const data = marketState.data[symbol];
          const now = Date.now();
          const lastUpdate = data?.lastUpdated || 0;
          const isStale = (now - lastUpdate) > 10000; // 10s Gap Threshold
          const isWsConnected = marketState.connectionStatus === "connected";

          // [HYBRID] Non-kline stale detection (ticker, depth, etc.)
          // isStale is still used for non-kline channels inside the forEach below.

          channels.forEach((_, channel) => {
            const lockKey = `${symbol}:${channel}`;
            // Skip if already in flight (Deduplication)
            if (this.historyFetcher.pendingRequests.has(lockKey)) return;

            if (channel.startsWith("kline_")) {
              // [HYBRID KLINE] Per-timeframe staleness check.
              // Global lastUpdated is updated by ticker/price WS messages, so it cannot
              // reliably indicate whether *kline* data for a specific timeframe is fresh.
              // Instead we use klinesLastUpdated[tf] which is only written when klines are
              // actually stored (WS tick or REST fetch). This ensures a timeframe whose
              // history load failed (e.g. rate-limit) is retried on the next polling cycle.
              const tf = channel.replace("kline_", "");
              const klineLastUpdated = data?.klinesLastUpdated?.[tf] || 0;
              const isKlineStale = (now - klineLastUpdated) > 10000; // 10s
              if (isWsConnected && !isKlineStale) return;
            } else {
              // Non-kline channels (ticker, depth, etc): use the global staleness guard.
              if (isWsConnected && !isStale) return;
            }

            tasks.push({ symbol, channel, lockKey });
          });
        });
        if (tasks.length === 0) return;
        const scheduleCount = Math.min(allowed, tasks.length);
        let stagger = 0;
        for (let i = 0; i < scheduleCount; i++) {
          const { symbol, channel } = tasks[i];
          const currentStagger = stagger;
          stagger += Math.floor(Math.random() * 150) + 50; // Random 50-200ms increments

          const timeoutId = setTimeout(() => {
            this.staggerTimeouts.delete(timeoutId);
            if (!this.isPolling) return; // Zombie Guard
            if (this.historyFetcher.inFlight >= this.maxConcurrentPolls) return;

            // Final dedupe check inside timeout
            const lockKey = `${symbol}:${channel}`;
            if (!this.historyFetcher.pendingRequests.has(lockKey)) {
              this.historyFetcher.pollSymbolChannel(symbol, channel, provider);
            }
          }, currentStagger);
          this.staggerTimeouts.add(timeoutId);
        }
    }

    public refreshActiveHistory() {
        this.registry.requests.forEach((channels, symbol) => {
          channels.forEach((reqs, channel) => {
            if (channel.startsWith("kline_") && reqs.has("chart")) {
              const tf = channel.replace("kline_", "");
              this.ensureHistory(symbol, tf);
            }
          });
        });
    }

    public getActiveSymbols(): string[] {
        return Array.from(this.registry.requests.keys());
    }

    /**
     * Check if history is currently being loaded (backfilled) for a symbol/timeframe.
     */
    public isBackfilling(symbol: string, tf: string): boolean {
        return this.historyFetcher.historyLocks.has(`${symbol}:${tf}`);
    }

    public forceCleanup() {
        this.registry.requests.clear();
        this.historyFetcher.pendingRequests.clear();
        this.historyFetcher.requestStartTimes.clear();
        this.historyFetcher.exhaustedHistory.clear();
        this.registry.prunedRequestIds.clear();
        this.historyFetcher.historyLocks.clear();
        this.staggerTimeouts.forEach(clearTimeout);
        this.staggerTimeouts.clear();
        this.historyFetcher.inFlight = 0;
        this.syncSubscriptions();
        this.registry._subscriptionsDirty = false;
        logger.warn("market", "[MarketWatcher] Forced Cleanup Triggered");
    }

    /**
     * Complete teardown of the MarketWatcher to prevent zombie timers/memory leaks.
     */
    public destroy() {
        this.stopPolling();
        this.staggerTimeouts.forEach(clearTimeout);
        this.staggerTimeouts.clear();
        this.registry.requests.clear();
        this.historyFetcher.pendingRequests.clear();
        this.historyFetcher.requestStartTimes.clear();
        this.historyFetcher.exhaustedHistory.clear();
        this.registry.prunedRequestIds.clear();
        this.historyFetcher.historyLocks.clear();
    }


    // Public API delegation
    public get requests() { return this.registry.requests; }
    public get _subscriptionsDirty() { return this.registry._subscriptionsDirty; }
    public set _subscriptionsDirty(v) { this.registry._subscriptionsDirty = v; }
    public get pendingRequests() { return this.historyFetcher.pendingRequests; }
    public get historyLocks() { return this.historyFetcher.historyLocks; }
    public get exhaustedHistory() { return this.historyFetcher.exhaustedHistory; }
    public get inFlight() { return this.historyFetcher.inFlight; }
    public set inFlight(v) { this.historyFetcher.inFlight = v; }
    public get requestStartTimes() { return this.historyFetcher.requestStartTimes; }

    // Test specific delegations
    public fillGaps(klines: Kline[], intervalMs: number) { return this.historyFetcher.fillGaps(klines, intervalMs); }
    public syncSubscriptions() { return this.registry.syncSubscriptions(); }
    public pruneZombieRequests() { return this.registry.pruneZombieRequests(); }
    public pollSymbolChannel(symbol: string, channel: string, provider: "bitunix" | "bitget") { return this.historyFetcher.pollSymbolChannel(symbol, channel, provider); }

    register(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {
        this.registry.register(symbol, channel, requirement);
    }

    unregister(symbol: string, channel: string, requirement: "chart" | "stateless" = "stateless") {
        this.registry.unregister(symbol, channel, requirement);
    }

    async ensureHistory(symbol: string, tf: string, targetLimit?: number) {
        return this.historyFetcher.ensureHistory(symbol, tf, targetLimit);
    }

    async loadMoreHistory(symbol: string, tf: string): Promise<LoadMoreHistoryResult> {
        return this.historyFetcher.loadMoreHistory(symbol, tf);
    }
}
export const marketWatcher = new MarketWatcher();
if (import.meta.hot) {
  import.meta.hot.dispose(() => marketWatcher.destroy());
}
