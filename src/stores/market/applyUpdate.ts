import { Decimal } from "decimal.js";
import { alertEngine } from "../../services/alertEngine/alertEngine";
import type { MarketUpdatePayload, RawNumeric } from "./types";
import type { MarketManager } from "../market.svelte";

export function applyUpdate(marketManager: MarketManager, symbol: string, partial: MarketUpdatePayload) {
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

        if (newVal !== null) {
          try {
            alertEngine.evaluate(symbol, newVal.toString(), Date.now());
          } catch (e) {
            import("../../services/logger").then(m => m.logger.error("alerts", `[Market] Alert evaluation failed for ${symbol}`, e)).catch(() => {});
          }
        }
      }
    }
    if (partial.indexPrice !== undefined) {
      const newVal = toDecimal(partial.indexPrice, current.indexPrice);
      if (newVal !== undefined) current.indexPrice = newVal;
    }
    if (partial.markPrice !== undefined) {
      const newVal = toDecimal(partial.markPrice, current.markPrice);
      if (newVal !== undefined) current.markPrice = newVal;
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
      const n = raw === null ? null : Number(raw);
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
