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

import { apiService, type FundingRateEntry, type FundingRateHistoryItem } from "./apiService";
import { marketState } from "../stores/market.svelte";
import { logger } from "./logger";
import { Decimal } from "decimal.js";

// Bitunix's funding_rate/batch endpoint returns the currently predicted rate
// for the *next* settlement, not the last locked-in one - it can still move
// before settlement (Bitunix's own UI likely shows the last settled rate
// instead, which is why the two can legitimately differ). A slow poll is
// still plenty fresh for this purpose and stays far under Bitunix's 10
// req/sec limit.
const POLL_INTERVAL_MS = 60_000;
const HISTORY_CACHE_TTL_MS = 5 * 60_000; // 5 minutes cache for 7d history

export interface FundingRateHistoryData {
  items: FundingRateHistoryItem[];
  avg7d: Decimal;
  minRate: Decimal;
  maxRate: Decimal;
  fetchedAt: number;
  isLoading: boolean;
  error: string | null;
}

class FundingRateService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  // Cache of the last successful batch fetch, keyed by symbol. Lets a symbol
  // that starts being tracked *between* polls (e.g. right after page load,
  // before the periodic poll has a tracked symbol to update) be backfilled
  // immediately from already-fetched data instead of waiting up to
  // POLL_INTERVAL_MS for the next scheduled poll - see applyCachedRateFor().
  private lastRates: Map<string, FundingRateEntry> | null = null;

  // History state for UI components (reactive Svelte 5 state)
  historyState = $state<Record<string, FundingRateHistoryData>>({});
  private inFlightHistory = new Map<string, Promise<FundingRateHistoryData>>();

  start(): void {
    if (this.intervalId) return;
    void this.poll();
    this.intervalId = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastRates = null;
  }

  /**
   * Apply the last fetched funding rate for `symbol` right away, if known.
   * Call this whenever a symbol starts being tracked in marketState (new
   * favorite, trade symbol change, WS subscription) so it doesn't sit
   * without a funding rate until the next scheduled poll.
   */
  applyCachedRateFor(symbol: string): void {
    const entry = this.lastRates?.get(symbol);
    if (!entry) return;
    marketState.updateSymbol(symbol, {
      fundingRate: entry.fundingRate,
      nextFundingTime: entry.nextFundingTime,
      fundingInterval: entry.fundingInterval,
    });
  }

  /**
   * The key `historyState` files a symbol under.
   *
   * Funding-rate history comes from Bitunix's batch endpoint whichever
   * exchange is active (`bitgetAdapter.account.fetchFundingRateHistory`
   * resolves empty), so the key is Bitunix-normalised — but that is this
   * service's business, not its callers'. Before FEAT-0016 the popover
   * re-derived the same key with the venue spelled into the component, which
   * held only as long as both sides guessed alike.
   */
  historyKey(symbol: string): string {
    return symbol ? apiService.normalizeSymbol(symbol, "bitunix") : "";
  }

  /**
   * Fetch 7-day funding rate history on-demand for `symbol`.
   * Caches results in memory for 5 minutes.
   */
  async fetchHistory(symbol: string, force = false): Promise<FundingRateHistoryData> {
    if (!symbol) {
      return {
        items: [],
        avg7d: new Decimal(0),
        minRate: new Decimal(0),
        maxRate: new Decimal(0),
        fetchedAt: 0,
        isLoading: false,
        error: null,
      };
    }

    const normSymbol = this.historyKey(symbol);
    const existing = this.historyState[normSymbol];
    const now = Date.now();

    if (!force && existing && !existing.isLoading && now - existing.fetchedAt < HISTORY_CACHE_TTL_MS) {
      return existing;
    }

    const inFlight = this.inFlightHistory.get(normSymbol);
    if (inFlight) return inFlight;

    // Set loading state in reactive object
    this.historyState[normSymbol] = {
      items: existing?.items ?? [],
      avg7d: existing?.avg7d ?? new Decimal(0),
      minRate: existing?.minRate ?? new Decimal(0),
      maxRate: existing?.maxRate ?? new Decimal(0),
      fetchedAt: existing?.fetchedAt ?? 0,
      isLoading: true,
      error: null,
    };

    const fetchPromise = (async () => {
      try {
        // Fetch up to 30 items (7 days @ 8h = 21 items)
        const items = await apiService.fetchBitunixFundingRateHistory(normSymbol, 30);
        
        let sum = new Decimal(0);
        let min = items.length > 0 ? items[0].fundingRate : new Decimal(0);
        let max = items.length > 0 ? items[0].fundingRate : new Decimal(0);

        for (const item of items) {
          sum = sum.plus(item.fundingRate);
          if (item.fundingRate.lt(min)) min = item.fundingRate;
          if (item.fundingRate.gt(max)) max = item.fundingRate;
        }

        const avg7d = items.length > 0 ? sum.dividedBy(items.length) : new Decimal(0);

        const data: FundingRateHistoryData = {
          items,
          avg7d,
          minRate: min,
          maxRate: max,
          fetchedAt: Date.now(),
          isLoading: false,
          error: null,
        };

        this.historyState[normSymbol] = data;
        return data;
      } catch (err: unknown) {
        logger.warn("market", `[FundingRate] History fetch failed for ${normSymbol}`, err);
        const data: FundingRateHistoryData = {
          items: existing?.items ?? [],
          avg7d: existing?.avg7d ?? new Decimal(0),
          minRate: existing?.minRate ?? new Decimal(0),
          maxRate: existing?.maxRate ?? new Decimal(0),
          fetchedAt: existing?.fetchedAt ?? 0,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to load funding rate history",
        };
        this.historyState[normSymbol] = data;
        return data;
      } finally {
        this.inFlightHistory.delete(normSymbol);
      }
    })();

    this.inFlightHistory.set(normSymbol, fetchPromise);
    return fetchPromise;
  }

  private async poll(): Promise<void> {
    try {
      const rates = await apiService.fetchBitunixFundingRates();
      this.lastRates = rates;
      for (const [symbol, entry] of rates) {
        // Only refresh symbols already tracked (watched/favorited/traded).
        // The batch endpoint returns every pair on the exchange - blindly
        // calling updateSymbol for all of them would create hundreds of new
        // cache entries and evict the actively-watched symbols from
        // marketState's LRU cache. Symbols not yet tracked at this point
        // are covered by applyCachedRateFor() once they start being tracked.
        if (!marketState.data[symbol]) continue;
        marketState.updateSymbol(symbol, {
          fundingRate: entry.fundingRate,
          nextFundingTime: entry.nextFundingTime,
          fundingInterval: entry.fundingInterval,
        });
      }
    } catch (e) {
      logger.warn("market", "[FundingRate] Poll failed", e);
    }
  }
}

export const fundingRateService = new FundingRateService();
