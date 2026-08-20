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

type BitunixWSMessage = Record<string, unknown>;
import type { z } from 'zod';
import {
  BitunixWSMessageSchema,
  StrictPriceDataSchema,
  StrictTickerDataSchema,
  StrictDepthDataSchema,
} from "../../types/bitunixValidation";
import { normalizeSymbol } from "../../utils/symbolUtils";
import { logger } from "../logger";
import { mdaService } from "../mdaService";

export type ParseOutcome =
  | { type: "fast_price"; symbol: string; data: z.infer<typeof StrictPriceDataSchema>; rawSymbol: string }
  | { type: "fast_ticker"; symbol: string; data: z.infer<typeof StrictTickerDataSchema>; rawSymbol: string; normalized: ReturnType<typeof mdaService.normalizeTicker> }
  | { type: "fast_depth"; symbol: string; data: z.infer<typeof StrictDepthDataSchema>; rawSymbol: string }
  | { type: "fast_kline"; symbol: string; timeframe: string; data: unknown; rawSymbol: string; ts?: number }
  | { type: "validated"; message: BitunixWSMessage }
  | { type: "critical_error"; issues: z.ZodIssue[] }
  | { type: "ignore"; reason?: string };

export interface ParserContext {
  shouldThrottle: (key: string, commit?: boolean) => boolean;
}

export function parseMessage(message: Record<string, unknown>, context: ParserContext): ParseOutcome {
  const channel = (message.ch as string) || (message.topic as string);
  try {
    if (message && channel) {
      const rawSymbol = (message.symbol as string) || "";
      const symbol = normalizeSymbol(rawSymbol, "bitunix");
      const data = message.data as Record<string, unknown>;
      const isObjectData = data && typeof data === "object" && !Array.isArray(data);
      if (isObjectData) {
        switch (channel) {
          case "price": {
            if (context.shouldThrottle(`${symbol}:price`, false)) return { type: "ignore", reason: "throttled" };
            const priceRes = StrictPriceDataSchema.safeParse(data);
            if (symbol && priceRes.success) {
              return { type: "fast_price", symbol, data: priceRes.data, rawSymbol };
            }
            break;
          }
          case "ticker": {
            if (context.shouldThrottle(`${symbol}:ticker`, false)) return { type: "ignore", reason: "throttled" };
            const tickerRes = StrictTickerDataSchema.safeParse(data);
            if (symbol && tickerRes.success) {
              const normalized = mdaService.normalizeTicker(message, "bitunix");
              return { type: "fast_ticker", symbol, data: tickerRes.data, rawSymbol, normalized };
            }
            break;
          }
          case "depth_book5": {
            if (context.shouldThrottle(`${symbol}:depth`, false)) return { type: "ignore", reason: "throttled" };
            const depthRes = StrictDepthDataSchema.safeParse(data);
            if (symbol && depthRes.success) {
              return { type: "fast_depth", symbol, data: depthRes.data, rawSymbol };
            }
            break;
          }
          default:
            if (channel.startsWith("market_kline_") || channel === "mark_kline_1day") {
              try {
                const d = data as { close?: unknown; c?: unknown; open?: unknown; o?: unknown } | undefined;
                if (d && (d.close || d.c || d.open || d.o)) {
                  let timeframe = "1h";
                  if (channel === "mark_kline_1day") timeframe = "1d";
                  else {
                    const match = channel.match(/market_kline_(.+)/);
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
                  return { type: "fast_kline", symbol, timeframe, data, rawSymbol, ts: typeof message.ts === "number" ? message.ts : undefined };
                }
              } catch (fastPathError) {
                if (import.meta.env.DEV) console.warn("[BitunixWS] FastPath error (kline):", fastPathError);
              }
            }
            break;
        }
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      logger.warn("network", "[BitunixWS] FastPath exception (falling back to std validation)", e);
    }
  }
  const validationResult = BitunixWSMessageSchema.safeParse(message);
  if (!validationResult.success) {
    const validationIssues = validationResult.error.issues;
    const criticalFields = ["event", "op", "ch", "topic", "code"];
    const isCritical = validationIssues.some(
      (i) => i.path.length === 0 || (i.path.length > 0 && criticalFields.includes(String(i.path[0])))
    );
    if (isCritical) return { type: "critical_error", issues: validationIssues };
    logger.warn("network", "[WebSocket] Invalid message structure (ignored)", validationResult.error.issues);
    return { type: "ignore", reason: "invalid_structure" };
  }
  return { type: "validated", message: validationResult.data };
}
