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

import { apiService } from "../apiService";
import { marketState } from "../../stores/market.svelte";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { tradeState } from "../../stores/trade.svelte";
import { RequestDeduplicator } from "../../utils/requestDeduplicator";
import { logger } from "../logger";
import { storageService } from "../storageService";
import { activeTechnicalsManager } from "../activeTechnicalsManager.svelte";
import { safeTfToMs } from "../../utils/timeUtils";
import { Decimal } from "decimal.js";
import { type Kline } from "../technicalsTypes";
import { settingsState } from "../../stores/settings.svelte";
import { type SubscriptionRegistry } from "./subscriptionRegistry";

export class HistoryFetcher {
    constructor(registry: SubscriptionRegistry) {
        this.registry = registry;
    }
    public registry!: SubscriptionRegistry;
    public pendingRequests = new RequestDeduplicator<void>();
    public requestStartTimes = new Map<string, number>();
    public exhaustedHistory = new Set<string>();
    public historyLocks = new Set<string>();
    public inFlight: number = 0;
    private lastErrorLog: number = 0;
    private readonly errorLogIntervalMs: number = 30000;

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

    /**
     * Backfill `symbol`:`tf` history into marketState, paginating around the
     * exchange's per-request candle cap (Bitunix hard-caps at 200 regardless
     * of the requested limit).
     *
     * @param targetLimit How many candles to aim for. Defaults to the user's
     *   chart history setting. Callers that need a specific indicator warm-up
     *   depth (e.g. the market analyst needs ~3x the EMA 200 period) pass their
     *   own target so they neither under-fetch nor drag the full chart depth.
     */
    public async ensureHistory(symbol: string, tf: string, targetLimit?: number): Promise<boolean> {
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
            const limit = targetLimit ?? (settingsState.chartHistoryLimit || 1000);
            const exhaustKey = `${symbol}:${tf}`;

            if (currentData.length >= limit || this.exhaustedHistory.has(exhaustKey)) {
                return false; // No more to fetch
            }

            // 3. Execute Fetch Logic
            // INITIAL FETCH: Use 200 to align with Bitunix actual behavior and prevent logic issues
            const initialLimit = 200;
            const klines1 = await apiService.fetchBitunixKlines(symbol, tf, initialLimit, undefined, Date.now());

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

                // Parallel Backfill (Hardened for Bitunix 200-candle limit)
                if (currentLen < limit) {
                    const batchSize = 200;
                    const intervalMs = safeTfToMs(tf);
                    const MAX_PARALLEL = 6; // W-12: Aligned with maxConcurrentPolls (6) to stay within rate-limiter budget

                    // Source of truth: store count
                    let currentTotal = marketState.data[symbol]?.klines[tf]?.length || klines1.length;
                    let lastOldestTime = marketState.data[symbol]?.klines[tf]?.[0]?.time || klines1[0].time;

                    logger.log("market", `[History] Starting parallel backfill for ${symbol}:${tf}. Target: ${limit}. Current: ${currentTotal}.`);

                    while (currentTotal < limit) {
                        const batchesNeeded = Math.ceil((limit - currentTotal) / batchSize);
                        const batchCount = Math.min(MAX_PARALLEL, batchesNeeded);

                        const promises = [];
                        for (let i = 0; i < batchCount; i++) {
                            // Predict end time for each batch based on expected density
                            const batchEndTime = lastOldestTime - 1 - (i * batchSize * intervalMs);
                            promises.push(apiService.fetchBitunixKlines(symbol, tf, batchSize, 1, batchEndTime));
                        }

                        const results = await Promise.all(promises);
                        const allNewKlines: Kline[] = [];
                        let reachedEnd = false;

                        for (const batch of results) {
                            if (!batch || batch.length === 0) {
                                reachedEnd = true;
                                continue;
                            }
                            allNewKlines.push(...batch);
                        }

                        const totalBeforeMerge = currentTotal;

                        if (allNewKlines.length > 0) {
                            const filled = this.fillGaps(allNewKlines, intervalMs);
                            marketState.updateSymbolKlines(symbol, tf, filled, "rest");

                            // Re-evaluate state after merge
                            const updatedHistory = marketState.data[symbol]?.klines[tf] || [];
                            currentTotal = updatedHistory.length;
                            if (updatedHistory.length > 0) lastOldestTime = updatedHistory[0].time;
                        }

                        if (reachedEnd || allNewKlines.length === 0) {
                            logger.log("market", `[History] Backfill reached end of history for ${symbol}:${tf} at ${currentTotal}/${limit}.`);
                            this.exhaustedHistory.add(exhaustKey);
                            break;
                        }

                        // Termination guard: batches came back non-empty but the stored
                        // history did not grow, so another identical round will not help.
                        // Without this the loop spins forever issuing API requests —
                        // reachable whenever the upstream ignores our endTime and keeps
                        // returning the same window, or every candle is a duplicate the
                        // store discards.
                        if (currentTotal <= totalBeforeMerge) {
                            logger.warn(
                                "market",
                                `[History] Backfill made no progress for ${symbol}:${tf} at ${currentTotal}/${limit} ` +
                                `(${allNewKlines.length} candles returned, none new). Marking history exhausted.`,
                            );
                            this.exhaustedHistory.add(exhaustKey);
                            break;
                        }
                    }

                    // FORCE FINAL CALCULATION
                    activeTechnicalsManager.forceRefresh(symbol, tf);
                }
            }
            return true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // On rate-limit errors the exchange told us to back off, not that history is
            // exhausted. Remove the exhausted marker so the polling loop retries on the
            // next cycle rather than silently skipping this timeframe forever.
            if (msg.includes("too frequently") || msg.includes("429") || msg.includes("klineError")) {
                this.exhaustedHistory.delete(`${symbol}:${tf}`);
                logger.warn("market", `[History] Rate-limited for ${symbol}:${tf}. Will retry next cycle.`);
            } else {
                logger.error("market", `[History] Unexpected error in ensureHistory for ${symbol}:${tf}`, e);
            }
            return false;
        } finally {
            this.historyLocks.delete(lockKey);
        }
    }

    public fillGaps(klines: Kline[], intervalMs: number): Kline[] {
        if (!klines || klines.length < 2) return klines || [];
        if (klines[0] && !(klines[0].open instanceof Decimal)) {
          // Fallback if somehow not Decimal, though types suggest it is.
          // In strict TS, this check might not be needed if typed correctly, but for runtime safety:
          return klines;
        }

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

        const result: Kline[] = [];
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
                           volume: new Decimal(0)
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
        if (this.historyLocks.has(lockKey)) return false;
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

    public async pollSymbolChannel(symbol: string, channel: string, provider: "bitunix" | "bitget") {
        if (!settingsState.entitlement.capabilities.marketData) return;
        const lockKey = `${symbol}:${channel}`;
        return this.pendingRequests.execute(lockKey, async () => {
            this.inFlight++;
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
                // Lock is released by RequestDeduplicator, but we still clean up metadata
                this.requestStartTimes.delete(lockKey);

                // Check if this request was already pruned as a zombie
                if (this.registry.prunedRequestIds.has(lockKey)) {
                    this.registry.prunedRequestIds.delete(lockKey);
                    // Do NOT decrement inFlight, as it was already decremented by pruneZombieRequests
                } else {
                    this.inFlight = Math.max(0, this.inFlight - 1);
                }
            }
        });
    }
}
