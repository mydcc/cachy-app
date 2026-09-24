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
 * Shared market-data shapes, extracted from apiService.ts (FEAT-0342).
 * Leaf module: only decimal.js and technicalsTypes imports.
 */

import { Decimal } from "decimal.js";
export type { Kline } from "../technicalsTypes";


export interface Ticker24h {
  provider: "bitunix" | "bitget";
  symbol: string;
  lastPrice: Decimal;
  // BUG-0512: mark price as the venue reported it (Bitunix Get Tickers,
  // Bitget tickers). Absent when the venue omits it — never synthesized.
  markPrice?: Decimal;
  priceChangePercent: Decimal;
  highPrice: Decimal;
  lowPrice: Decimal;
  volume: Decimal; // Base volume usually
  quoteVolume?: Decimal;
}

export interface FundingRateEntry {
  fundingRate: Decimal; // normalized fraction, e.g. 0.0005 = 0.05% (see fetchBitunixFundingRates)
  nextFundingTime: number | string; // ms epoch
  fundingInterval?: number | string; // settlement interval in hours, varies per symbol
}

export interface FundingRateHistoryItem {
  fundingRate: Decimal; // normalized fraction, e.g. 0.0001 = 0.01%
  fundingTime: number; // epoch ms
  markPrice?: Decimal | null;
}
