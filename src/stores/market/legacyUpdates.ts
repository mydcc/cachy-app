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

import { Decimal } from "decimal.js";
import type { RawPriceUpdate, RawTickerUpdate, RawDepthUpdate, RawKlineWsMessage } from "./types";
import type { MarketUpdatePayload } from "./types";

export function updatePrice(marketManager: import("../market.svelte").MarketManager, symbol: string, data: RawPriceUpdate) {
  try {
    const update: MarketUpdatePayload = {
      nextFundingTime: data.nextFundingTime,
    };

    if (data.price !== undefined) update.lastPrice = data.price;
    if (data.indexPrice !== undefined) update.indexPrice = data.indexPrice;
    if (data.markPrice !== undefined) update.markPrice = data.markPrice;
    if (data.fundingRate !== undefined) update.fundingRate = data.fundingRate;

    marketManager.updateSymbol(symbol, update);
  } catch {
      // ...
  }
}

export function updateTicker(marketManager: import("../market.svelte").MarketManager, symbol: string, data: RawTickerUpdate) {
  try {
    const update: MarketUpdatePayload = {};

    if (data.lastPrice !== undefined) update.lastPrice = data.lastPrice;
    if (data.high !== undefined) update.highPrice = data.high;
    if (data.low !== undefined) update.lowPrice = data.low;
    if (data.vol !== undefined) update.volume = data.vol;
    if (data.quoteVol !== undefined) update.quoteVolume = data.quoteVol;
    if (data.fundingRate !== undefined) update.fundingRate = data.fundingRate;
    if (data.nextFundingTime !== undefined) update.nextFundingTime = data.nextFundingTime;

    let calculatedChange = false;
    if (data.open) {
      const open = new Decimal(data.open);
      const last = update.lastPrice ? new Decimal(update.lastPrice) : marketManager.data[symbol]?.lastPrice;

      if (!open.isZero() && last) {
        update.priceChangePercent = last
          .minus(open)
          .div(open)
          .times(100);
        calculatedChange = true;
      }
    }

    if (!calculatedChange && data.change !== undefined) {
      update.priceChangePercent = new Decimal(data.change as Decimal.Value).times(100);
    }

    marketManager.updateSymbol(symbol, update);
  } catch {
     // ...
  }
}

export function updateDepth(marketManager: import("../market.svelte").MarketManager, symbol: string, data: RawDepthUpdate) {
  try {
    marketManager.updateSymbol(symbol, {
      depth: { bids: data.bids, asks: data.asks },
    });
  } catch {
     // ...
  }
}

export function updateKline(marketManager: import("../market.svelte").MarketManager, symbol: string, timeframe: string, data: RawKlineWsMessage) {
  try {
    marketManager.updateSymbolKlines(
      symbol,
      timeframe,
      [
        {
          open: data.o,
          high: data.h,
          low: data.l,
          close: data.c,
          volume: data.b,
          time: data.t,
        },
      ],
      "ws"
    );
  } catch {
     // ...
  }
}
