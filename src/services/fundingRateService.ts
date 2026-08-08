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

import { apiService } from "./apiService";
import { marketState } from "../stores/market.svelte";
import { logger } from "./logger";

// Funding rate only changes at settlement (hours apart per fundingInterval),
// so a slow poll is plenty fresh and stays far under Bitunix's 10 req/sec limit.
const POLL_INTERVAL_MS = 60_000;

class FundingRateService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

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
  }

  private async poll(): Promise<void> {
    try {
      const rates = await apiService.fetchBitunixFundingRates();
      for (const [symbol, entry] of rates) {
        // Only refresh symbols already tracked (watched/favorited/traded).
        // The batch endpoint returns every pair on the exchange - blindly
        // calling updateSymbol for all of them would create hundreds of new
        // cache entries and evict the actively-watched symbols from
        // marketState's LRU cache.
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
