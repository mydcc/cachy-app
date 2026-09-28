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
import type { MarketUpdatePayload, RawNumeric } from "./types";
import type { QuoteSource } from "../../services/priceResolution";


export function applyUpdate(marketManager: import("../market.svelte").MarketManager, symbol: string, partial: MarketUpdatePayload, source?: QuoteSource) {
  try {
    marketManager.touchSymbol(symbol);
    const current = marketManager.getOrCreateSymbol(symbol);
    current.lastUpdated = Date.now();

    const toDecimal = (val: RawNumeric, currentVal: Decimal | null | undefined): Decimal | undefined | null => {
      try {
        if (val === undefined) return undefined;
        if (val === null) return null;
        if (typeof val === 'number' && isNaN(val)) return undefined;
        if (currentVal === val) return currentVal;
        const valStr = String(val);
        if (currentVal && currentVal.toString() === valStr) return currentVal;
        return new Decimal(val);
      } catch {
        return undefined;
      }
    };

    if (partial.lastPrice !== undefined) {
      const newVal = toDecimal(partial.lastPrice, current.lastPrice);
      if (newVal !== undefined) {
        if (newVal === null && import.meta.env.DEV) {
          console.warn(`[Market] Received null lastPrice for ${symbol}`);
        }
        current.lastPrice = newVal;
        // BUG-0558: stamp only when a real value arrived (mirrors BUG-0512's
        // markPriceUpdatedAt). A sourceless update (technicals, depth,
        // funding) keeps the old price AND the old stamp/source — the price
        // did not get fresher.
        if (newVal !== null) {
          current.lastPriceUpdatedAt = Date.now();
          if (source !== undefined) current.lastPriceSource = source;
        }

        // FEAT-0399: nothing evaluates here any more. The legacy engine was a
        // per-tick cross detector, so this call site had to run on every price
        // update to keep its `last_prices` baseline seeded (FEAT-0368 measured
        // the guard that would have skipped it and found it changed behaviour).
        // Rules are evaluated on candle close by `ruleEvaluationLoop` instead,
        // which is driven from the kline path, not from here.
      }
    }
    if (partial.indexPrice !== undefined) {
      const newVal = toDecimal(partial.indexPrice, current.indexPrice);
      if (newVal !== undefined) current.indexPrice = newVal;
    }
    if (partial.markPrice !== undefined) {
      const newVal = toDecimal(partial.markPrice, current.markPrice);
      if (newVal !== undefined) {
        current.markPrice = newVal;
        // BUG-0512: stamp only when a real value arrived. An explicit
        // `markPrice: undefined` on a partial (e.g. an index-price-only WS
        // tick) keeps the old price AND the old stamp — the price did not
        // get fresher.
        if (newVal !== null) current.markPriceUpdatedAt = Date.now();
      }
    }
    if (partial.highPrice !== undefined) {
      const newVal = toDecimal(partial.highPrice, current.highPrice);
      if (newVal !== undefined) current.highPrice = newVal;
    }
    if (partial.lowPrice !== undefined) {
      const newVal = toDecimal(partial.lowPrice, current.lowPrice);
      if (newVal !== undefined) current.lowPrice = newVal;
    }
    if (partial.volume !== undefined) {
      const newVal = toDecimal(partial.volume, current.volume);
      if (newVal !== undefined) current.volume = newVal;
    }
    if (partial.quoteVolume !== undefined) {
      const newVal = toDecimal(partial.quoteVolume, current.quoteVolume);
      if (newVal !== undefined) current.quoteVolume = newVal;
    }
    if (partial.priceChangePercent !== undefined) {
      const newVal = toDecimal(partial.priceChangePercent, current.priceChangePercent);
      if (newVal !== undefined) current.priceChangePercent = newVal;
    }
    if (partial.fundingRate !== undefined) {
      const newVal = toDecimal(partial.fundingRate, current.fundingRate);
      if (newVal !== undefined) current.fundingRate = newVal;
    }
    if (partial.fundingInterval !== undefined) {
      const raw = partial.fundingInterval;
      const n = raw === null ? null : Number(raw); // audit: safe — fundingInterval is a time interval (e.g. hours), not a price or amount
      if (n === null || !isNaN(n)) current.fundingInterval = n;
    }

    if (partial.nextFundingTime !== undefined && partial.nextFundingTime !== null) {
      let nft: number = 0;
      const raw = partial.nextFundingTime;

      if (typeof raw === "number") {
        nft = raw;
      } else if (typeof raw === "string") {
        if (/^\d+$/.test(raw)) {
          nft = parseInt(raw, 10);
        } else {
          const parsed = new Date(raw).getTime();
          if (!isNaN(parsed)) {
            nft = parsed;
          }
        }
      }

      if (nft > 0 && nft < 10000000000) {
        nft *= 1000;
      }
      current.nextFundingTime = nft > 0 ? nft : null;
    }

    if (partial.depth && typeof partial.depth === "object") current.depth = partial.depth;
    if (partial.technicals && typeof partial.technicals === "object") {
      current.technicals = { ...(current.technicals || {}), ...partial.technicals };
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error(`[Market] Critical error applying update for ${symbol}`, e);
    }
  }
}
