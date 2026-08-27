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
import { normalizeSymbol } from "../../utils/symbolUtils";
import { browser } from "$app/environment";
import { logger } from "../logger";
import { activeExchange } from "../exchange";
import type { MarketDataPort } from "../exchange";
import { SubscriptionLedger } from "../exchange/subscriptionLedger";
import { type HistoryFetcher } from "./historyFetcher";

/*
 * FEAT-0227 — this file used to import `bitunixWs`, read its internal
 * subscription map and short-circuit whenever the active provider was not
 * Bitunix. Which symbols are wanted is a consumer question and belongs here;
 * which channel names a venue answers to is a venue question and belongs in
 * the adapter. Both now sit where they belong: the ledger counts, the adapter
 * translates, and this class never learns a venue's name.
 */

export class SubscriptionRegistry {
    constructor(historyFetcher: HistoryFetcher) {
        this.historyFetcher = historyFetcher;
    }
    public historyFetcher!: HistoryFetcher;
    public requests: Map<string, Map<string, Map<string, number>>> = new Map();
    /** The one reference count of venue channels, above every adapter. */
    public ledger = new SubscriptionLedger();
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
          this.syncChannelSubscription();
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

    /**
     * Subscribes immediately for a channel that just gained its first
     * requester, rather than waiting for the next `syncSubscriptions` tick —
     * a tile that has just been opened should not sit blank for a loop.
     *
     * Deliberately not `browser`-guarded, matching what it replaced: a
     * `register` outside the browser subscribed then too, and the adapter is
     * the layer that decides whether it can open a socket.
     */
    private syncChannelSubscription() {
        untrack(() => {
            const marketData = activeExchange().marketData;
            this.applyDelta(marketData, this.reconcileLedger(marketData));
        });
    }

    /**
     * Everything the current requests expand to, in the active venue's own
     * channel names.
     */
    private intendedTargets(marketData: MarketDataPort) {
        const intended: { symbol: string; channel: string }[] = [];
        this.requests.forEach((channels, symbol) => {
            channels.forEach((_reqs, requirement) => {
                for (const venueChannel of marketData.channelsForRequirement(requirement)) {
                    intended.push({ symbol, channel: venueChannel });
                }
            });
        });
        return intended;
    }

    private reconcileLedger(marketData: MarketDataPort) {
        return this.ledger.reconcile(this.intendedTargets(marketData));
    }

    private applyDelta(
        marketData: MarketDataPort,
        delta: { subscribe: { symbol: string; channel: string }[]; unsubscribe: { symbol: string; channel: string }[] },
    ) {
        for (const { symbol, channel } of delta.unsubscribe) {
            marketData.unsubscribe(symbol, channel);
        }
        for (const { symbol, channel } of delta.subscribe) {
            marketData.subscribe(symbol, channel);
        }
    }

    public syncSubscriptions() {
        if (!browser) return;
        const marketData = activeExchange().marketData;
        this.applyDelta(marketData, this.reconcileLedger(marketData));
    }

    /**
     * Declares that the active socket holds nothing — a provider reconnected,
     * or the venue changed. The next reconcile therefore re-issues every
     * wanted channel instead of assuming the socket still has them.
     *
     * A provider's own subscription buffer does not survive its
     * destroy()/connect() cycle, but the registered interest here does; before
     * FEAT-0227 this gap was detected by reading the venue socket's internal
     * map from the outside.
     */
    public forgetIssuedSubscriptions() {
        this.ledger.forgetIssued();
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
