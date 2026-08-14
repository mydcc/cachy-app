import { untrack } from "svelte";
import { bitunixWs } from "../bitunixWs";
import { settingsState } from "../../stores/settings.svelte";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { browser } from "$app/environment";
import { logger } from "../logger";
import { getChannelsForRequirement } from "../../types/dataRequirements";
import { type HistoryFetcher } from "./historyFetcher";

export class SubscriptionRegistry {
    constructor(historyFetcher: HistoryFetcher) {
        this.historyFetcher = historyFetcher;
    }
    public historyFetcher!: HistoryFetcher;
    public requests: Map<string, Map<string, Map<string, number>>> = new Map();
    public _subscriptionsDirty: boolean = false;
    public prunedRequestIds: Map<string, number> = new Map();

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
        if (totalChannelCount === 1) {
          this._subscriptionsDirty = true;
          // Start polling/WS immediately
          this.syncChannelSubscription(normSymbol, channel);
        }

        if (requirement === "chart" && channel.startsWith("kline_")) {
          const tf = channel.replace("kline_", "");
          this.historyFetcher.ensureHistory(normSymbol, tf);
        } else if (requirement === "stateless" && channel.startsWith("kline_")) {
            const tf = channel.replace("kline_", "");
            // Request shallow history (e.g. 100 candles) for technicals calculation
            this.historyFetcher.ensureShallowHistory(normSymbol, tf);
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
             // Note: Legacy explicit subscription block removed (W-4).
             // getChannelsForRequirement() already covers price/ticker/kline channels.
        }
        });
    }

    public syncSubscriptions() {
        if (!browser) return;
        const settings = settingsState;
        if (settings.apiProvider !== "bitunix") {
          // If we switched away from Bitunix, clear all WS subscriptions
          // Use pendingSubscriptions instead of publicSubscriptions
          Array.from(bitunixWs.pendingSubscriptions.keys()).forEach((key: string) => {
            const [channel, symbol] = key.split(":");
            bitunixWs.unsubscribe(symbol, channel);
          });
          return;
        }

        const intended = new Map<string, { symbol: string; channel: string }>();
        this.requests.forEach((channels, symbol) => {
          channels.forEach((reqs, ch) => {
            const wsChannels = getChannelsForRequirement(ch);
            wsChannels.forEach(bitunixChannel => {
              const key = `${bitunixChannel}:${symbol}`;
              intended.set(key, { symbol, channel: bitunixChannel });
            });
          });
        });
        const current = bitunixWs.pendingSubscriptions;
        const toUnsubscribe: string[] = [];
        current.forEach((_: number, key: string) => {
            if (!intended.has(key)) toUnsubscribe.push(key);
        });
        toUnsubscribe.forEach(key => {
            const [channel, symbol] = key.split(":");
            bitunixWs.unsubscribe(symbol, channel);
        });
        intended.forEach(({ symbol, channel }, key) => {
            if (!current.has(key)) {
                 bitunixWs.subscribe(symbol, channel);
            }
        });
    }

    public pruneZombieRequests() {
        const now = Date.now();
        const timeout = 20000;
        this.historyFetcher.requestStartTimes.forEach((start, key) => {
            if (now - start > timeout) {
                logger.warn("market", `[MarketWatcher] Detected zombie request for ${key}. Removing lock.`);
                this.historyFetcher.pendingRequests.delete(key);
                this.historyFetcher.requestStartTimes.delete(key);
                // Decrease inFlight count if it was counted
                // Since we don't know for sure if it finished or hung, we decrement carefully
                this.historyFetcher.inFlight = Math.max(0, this.historyFetcher.inFlight - 1);
                // Mark as pruned so the finally block doesn't decrement again
                this.prunedRequestIds.set(key, now);
            }
        });
        if (this.historyFetcher.exhaustedHistory.size > 1000) {
            this.historyFetcher.exhaustedHistory.clear();
            logger.warn("market", "[MarketWatcher] Cleared exhaustedHistory to prevent memory leak");
        }

        if (this.prunedRequestIds.size > 1000) {
            // Only evict entries old enough that their finally blocks have
            // certainly already run (or will never run). The zombie timeout
            // is 20s, so 60s gives a 3× safety margin.
            const AGE_THRESHOLD = 60_000;
            let evicted = 0;
            for (const [id, prunedAt] of this.prunedRequestIds) {
                if (now - prunedAt > AGE_THRESHOLD) {
                    this.prunedRequestIds.delete(id);
                    evicted++;
                }
            }
            logger.warn("market", `[MarketWatcher] Evicted ${evicted} stale entries from prunedRequestIds (remaining: ${this.prunedRequestIds.size})`);
        }
    }

    public pruneOrphanedSubscriptions() {
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
}
