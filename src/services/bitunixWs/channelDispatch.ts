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

import type { ParseOutcome } from "./messageParser";
import Decimal from "decimal.js";
import { marketState } from "../../stores/market.svelte";
import { accountState } from "../../stores/account.svelte";
import { omsService } from "../omsService";
import { mdaService } from "../mdaService";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { isAllowedChannel } from "../../types/bitunixValidation";
import { mapToOMSPosition, mapToOMSOrder } from "../mappers";
import { BitunixPriceDataSchema } from "../../types/bitunixValidation";
import { logger } from "../logger";


export interface DispatchContext {
  commitThrottle: (key: string) => void;
  safeString: (val: unknown, symbol: string, field: string) => string | undefined;
  debugLogRawFundingRate: (symbol: string, fr: string) => void;
  shouldThrottle: (key: string) => boolean;
  tradeListeners: Map<string, Set<(trade: import('../bitunixWs').TradeData) => void>>;
  syntheticSubs: Map<string, number>;
}

export function dispatchMessage(parsed: ParseOutcome, context: DispatchContext) {
  if (parsed.type === "ignore" || parsed.type === "critical_error") return;
  if (parsed.type === "fast_price") {
    const { symbol, data } = parsed;
    const ip = data.ip !== undefined ? context.safeString(data.ip, symbol, "indexPrice") : undefined;
    const mp = data.mp !== undefined ? context.safeString(data.mp, symbol, "markPrice") : undefined;
    const fr = data.fr !== undefined ? context.safeString(data.fr, symbol, "fundingRate") : undefined;
    if (fr !== undefined) context.debugLogRawFundingRate(symbol, fr);
    if (typeof data.lastPrice === "number" || typeof data.lp === "number") {
      context.safeString(data.lastPrice ?? data.lp, symbol, "lastPrice");
    }
    context.commitThrottle(`${symbol}:price`);
    marketState.updateSymbol(symbol, {
      indexPrice: ip ? new Decimal(ip) : undefined,
      markPrice: mp ? new Decimal(mp) : undefined,
    });
    return;
  }
  if (parsed.type === "fast_ticker") {
    const { symbol, normalized } = parsed;
    if (normalized) {
      context.commitThrottle(`${symbol}:ticker`);
      marketState.updateSymbol(symbol, {
        lastPrice: normalized.lastPrice,
        highPrice: normalized.high,
        lowPrice: normalized.low,
        volume: normalized.volume,
        quoteVolume: normalized.quoteVolume,
      });
    }
    return;
  }
  if (parsed.type === "fast_depth") {
    const { symbol, data } = parsed;
    const bids = data.b as [string, string][];
    const asks = data.a as [string, string][];
    context.commitThrottle(`${symbol}:depth`);
    marketState.updateDepth(symbol, { bids, asks });
    return;
  }
  if (parsed.type === "fast_kline") {
    const { symbol, timeframe, data } = parsed;
    const kline = mdaService.normalizeKlines([data], 'bitunix');
    if (kline) marketState.updateSymbolKlines(symbol, timeframe, kline, 'ws');
    return;
  }
  if (parsed.type === "validated") {
    const validatedMessage = parsed.message;
    const validatedChannel = ((validatedMessage as Record<string, unknown>).ch as string) || ((validatedMessage as Record<string, unknown>).topic as string);
    if (validatedChannel && !isAllowedChannel(validatedChannel)) {
      logger.warn("network", "[WebSocket] Unknown channel", validatedChannel);
      return;
    }
    if (validatedChannel === "price") {
      const rawSymbol = ((validatedMessage as Record<string, unknown>).symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      if (context.shouldThrottle(`${symbol}:price`)) return;
      const priceData = BitunixPriceDataSchema.safeParse((validatedMessage as Record<string, unknown>).data);
      if (priceData.success) {
        const d = priceData.data;
        marketState.updateSymbol(symbol, {
          indexPrice: d.ip ? String(d.ip) : undefined,
          markPrice: d.mp ? String(d.mp) : undefined,
        });
      }
    } else if (validatedChannel === "ticker") {
      const rawSymbol = ((validatedMessage as Record<string, unknown>).symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      if (context.shouldThrottle(`${symbol}:ticker`)) return;
      const normalized = mdaService.normalizeTicker(validatedMessage as Record<string, unknown>, "bitunix");
      if (normalized) {
        marketState.updateSymbol(symbol, {
          lastPrice: normalized.lastPrice,
          highPrice: normalized.high,
          lowPrice: normalized.low,
          volume: normalized.volume,
          quoteVolume: normalized.quoteVolume,
        });
      }
    } else if (validatedChannel === "depth_book5") {
      const rawSymbol = ((validatedMessage as Record<string, unknown>).symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      if (context.shouldThrottle(`${symbol}:depth`)) return;
      const data = (validatedMessage as Record<string, unknown>).data as Record<string, unknown>;
      const d = data as { a?: unknown[], b?: unknown[] };
      if (d && d.a && d.b) {
        marketState.updateDepth(symbol, {
          bids: d.b.map((level: unknown) => [String((level as unknown[])[0]), String((level as unknown[])[1])]),
          asks: d.a.map((level: unknown) => [String((level as unknown[])[0]), String((level as unknown[])[1])]),
        });
      }
    } else if (validatedChannel?.startsWith("market_kline_") || validatedChannel === "mark_kline_1day") {
      const rawSymbol = ((validatedMessage as Record<string, unknown>).symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      let timeframe = "1h";
      if (validatedChannel === "mark_kline_1day") timeframe = "1d";
      else {
        const match = validatedChannel.match(/market_kline_(.+)/);
        if (match) {
          const bitunixTf = match[1];
          const revMap: Record<string, string> = {
            "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
            "60min": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M",
            "1hour": "1h", "1day_mark": "1d"
          };
          timeframe = revMap[bitunixTf] || bitunixTf;
        }
      }
      const kline = mdaService.normalizeKlines([(validatedMessage as Record<string, unknown>).data], 'bitunix');
      if (kline) marketState.updateSymbolKlines(symbol, timeframe, kline, 'ws');
    } else if (validatedChannel === "trade") {
      const rawSymbol = ((validatedMessage as Record<string, unknown>).symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      const data = (validatedMessage as Record<string, unknown>).data as Record<string, unknown>;

      const isTradeData = (d: unknown): boolean => {
         return d !== null && typeof d === 'object' && 'p' in d && 'v' in d && 's' in d && 't' in d;
      };

      if (data && (Array.isArray(data) ? isTradeData(data[0]) : isTradeData(data))) {
         const items = Array.isArray(data) ? data : [data];
         const listeners = context.tradeListeners.get(symbol);
         if (listeners) {
             for (const item of items) {
                 const t = {
                     price: String((item as Record<string, unknown>).p),
                     amount: String((item as Record<string, unknown>).v),
                     side: (item as Record<string, unknown>).s === 1 || (item as Record<string, unknown>).s === "1" || (item as Record<string, unknown>).s === "buy" ? ("buy" as const) : ("sell" as const),
                     timestamp: typeof (item as Record<string, unknown>).t === 'number' ? (item as Record<string, unknown>).t as number : parseInt((item as Record<string, unknown>).t as string) || Date.now(),
                     isSynthetic: false
                 };
                 listeners.forEach((listener) => {
                     try {
                         listener(t as unknown as import('../bitunixWs').TradeData);
                     } catch (err) {
                         logger.error("network", "[BitunixWS] Trade listener error", err);
                     }
                 });
             }
         }
      }
    } else if (validatedChannel === "position") {
      const data = (validatedMessage as Record<string, unknown>).data as Record<string, unknown>;
      if (data) {
        if (Array.isArray(data)) {
          data.forEach((item: Record<string, unknown>) => {
            if (typeof item.positionId === "number") item.positionId = String(item.positionId);
            accountState.updatePositionFromWs(item);
            omsService.updatePosition(mapToOMSPosition(item));
          });
        } else {
          const item = data as Record<string, unknown>;
          if (typeof item.positionId === "number") item.positionId = String(item.positionId);
          accountState.updatePositionFromWs(item);
          omsService.updatePosition(mapToOMSPosition(item));
        }
      }
    } else if (validatedChannel === "order") {
      const data = (validatedMessage as Record<string, unknown>).data as Record<string, unknown>;
      if (data) {
        const sanitize = (item: Record<string, unknown>) => {
          if (typeof item.orderId === "number") {
            if (item.orderId > 9007199254740991) {
              logger.warn("network", `[BitunixWS] CRITICAL: numeric orderId detected > MAX_SAFE_INTEGER: ${item.orderId}`);
            }
            item.orderId = String(item.orderId);
          }
          return item;
        };
        if (Array.isArray(data)) {
          data.forEach((item: Record<string, unknown>) => {
            const safeItem = sanitize(item);
            accountState.updateOrderFromWs(safeItem);
            omsService.updateOrder(mapToOMSOrder(safeItem));
          });
        } else {
          const safeItem = sanitize(data as Record<string, unknown>);
          accountState.updateOrderFromWs(safeItem);
          omsService.updateOrder(mapToOMSOrder(safeItem));
        }
      }
    } else if (validatedChannel === "wallet") {
      const data = (validatedMessage as Record<string, unknown>).data as Record<string, unknown>;
      if (data) {
        if (Array.isArray(data)) data.forEach((item: Record<string, unknown>) => accountState.updateBalanceFromWs(item));
        else accountState.updateBalanceFromWs(data);
      }
    }
  }
}
