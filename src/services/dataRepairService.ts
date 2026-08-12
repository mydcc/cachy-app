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

import { journalState } from "../stores/journal.svelte";
import { apiService, ApiStatusError, type Kline } from "./apiService";
import { calculator } from "../lib/calculator";
import { normalizeSymbol } from "../utils/symbolUtils";
import { logger } from "./logger";
import { settingsState } from "../stores/settings.svelte";
import pLimit from "p-limit";

export interface RepairError {
  tradeId: string | number;
  symbol: string;
  error: string;
  timestamp: number;
}

export interface RepairResult {
  total: number;
  successful: number;
  failed: number;
  errors: RepairError[];
}

// Helper to try multiple providers
async function fetchSmartKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
  knownProvider?: "bitunix" | "bitget" | "custom",
): Promise<{ klines: Kline[]; provider: "bitunix" | "bitget" } | null> {
  // If "custom" or unknown string, default to checking list.
  // We prioritize known provider if set and valid.
  const candidates: ("bitunix" | "bitget")[] =
    knownProvider === "bitunix" || knownProvider === "bitget"
      ? [knownProvider]
      : ["bitunix", "bitget"];

  // If user has a preferred provider in settings, maybe prioritize that?
  // But legacy data is likely Bitunix.
  // If we don't know, checking Bitunix first is safer for legacy data.

  try {
    const promises: Promise<{ klines: Kline[]; provider: "bitunix" | "bitget" }>[] = [];

    if (candidates.includes("bitunix")) {
      promises.push(
        apiService
          .fetchBitunixKlines(
            normalizeSymbol(symbol, "bitunix"),
            interval,
            limit,
            start,
            end,
            "normal",
          )
          .then((klines) => {
            if (klines && klines.length > 0) {
              return { klines, provider: "bitunix" as const };
            }
            throw new Error("apiErrors.symbolNotFound");
          })
          .catch((e: unknown) => {
            const isNotFound =
              (e instanceof Error && e.message === "apiErrors.symbolNotFound") ||
              (e instanceof ApiStatusError && e.status === 404);
            if (!isNotFound) {
              logger.warn(
                "journal",
                `[DataRepair] bitunix fetch failed for ${symbol}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            throw e;
          }),
      );
    }

    if (candidates.includes("bitget")) {
      promises.push(
        apiService
          .fetchBitgetKlines(
            normalizeSymbol(symbol, "bitget"),
            interval,
            limit,
            start,
            end,
            "normal",
          )
          .then((klines) => {
            if (klines && klines.length > 0) {
              return { klines, provider: "bitget" as const };
            }
            throw new Error("apiErrors.symbolNotFound");
          })
          .catch((e: unknown) => {
            const isNotFound =
              (e instanceof Error && e.message === "apiErrors.symbolNotFound") ||
              (e instanceof ApiStatusError && e.status === 404);
            if (!isNotFound) {
              logger.warn(
                "journal",
                `[DataRepair] bitget fetch failed for ${symbol}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            throw e;
          }),
      );
    }

    return await Promise.any(promises);
  } catch {
    return null;
  }
}

export const dataRepairService = {
  /**
   * Scans the journal for trades that are "Won" or "Lost" but missing 'atrValue'.
   * @returns The number of trades needing repair.
   */
  scanForMissingAtr(): number {
    const trades = journalState.entries;
    let count = 0;
    for (const t of trades) {
      if ((t.status === "Won" || t.status === "Lost") && !t.atrValue) {
        count++;
      }
    }
    return count;
  },

  /**
   * Iterates through trades and attempts to fetch historical data
   * to calculate the ATR. Updates the journalState directly.
   *
   * @param onProgress Callback (current, total, message)
   * @param force If true, recalculates even if atrValue already exists
   */
  async repairMissingAtr(
    onProgress: (current: number, total: number, message: string) => void,
    force: boolean = false,
  ) {
    const allTrades = journalState.entries;
    const targets = allTrades.filter(
      (t) =>
        (t.status === "Won" || t.status === "Lost") && (force || !t.atrValue),
    );

    const total = targets.length;
    if (total === 0) {
      onProgress(0, 0, "Keine Trades zum Reparieren gefunden.");
      return;
    }

    let processed = 0;
    let failed = 0;

    // Use configured timeframe
    const interval = settingsState.repairTimeframe || "15m";

    const limit = pLimit(5); // Concurrency limit

    // Helper to parse interval to ms
    const parseIntervalMs = (inv: string) => {
      const unit = inv.slice(-1);
      const val = parseInt(inv.slice(0, -1)) || 1;
      switch(unit) {
        case 'm': return val * 60 * 1000;
        case 'h': return val * 60 * 60 * 1000;
        case 'd': return val * 24 * 60 * 60 * 1000;
        case 'w': return val * 7 * 24 * 60 * 60 * 1000;
        default: return 15 * 60 * 1000; // default 15m for ATR
      }
    };
    const msPerCandle = parseIntervalMs(interval);
    const MAX_SPAN_MS = 900 * msPerCandle;

    // Group by symbol and provider, similar to repairMfeMae
    const chunks: { symbol: string, provider?: "bitunix" | "bitget" | "custom", startTs: number, endTs: number, trades: typeof targets }[] = [];

    const symbolGroups = new Map<string, typeof targets>();
    for (const t of targets) {
      const timeStr = t.entryDate || t.date;
      const timestamp = new Date(timeStr).getTime();
      if (isNaN(timestamp)) {
        logger.warn(
          "journal",
          `[DataRepair] Invalid date for trade ${t.id}, skipping.`,
        );
        failed++;
        processed++;
        onProgress(processed, total, `Skipped ${t.symbol}...`);
        continue;
      }

      const k = `${t.symbol}_${t.provider || 'default'}`;
      if (!symbolGroups.has(k)) symbolGroups.set(k, []);
      symbolGroups.get(k)!.push(t);
    }

    for (const groupTrades of symbolGroups.values()) {
      groupTrades.sort((a, b) => {
          const ta = new Date(a.entryDate || a.date).getTime();
          const tb = new Date(b.entryDate || b.date).getTime();
          return ta - tb;
      });

      let currentChunk: typeof chunks[0] | null = null;
      for (const t of groupTrades) {
        const timeStr = t.entryDate || t.date;
        const s = new Date(timeStr).getTime();

        // Ensure we fetch a bit more history to account for missing candles (e.g. gaps/weekends)
        // A generous lookback window for the 25 candles (14 days = 14*24*60*60*1000 ms roughly for 15m)
        // Actually, just fetching up to 1000 candles before the timestamp is safer.
        // We can just fetch 1000 candles leading up to 's' directly, but then we wouldn't batch efficiently
        // if trades are far apart.
        // To batch, let's just make sure the chunk covers the trades' timestamps and goes back far enough.
        // Let's set reqStart to (s - 200 * msPerCandle) to safely cover 25 candles even with gaps.
        const reqStart = s - (200 * msPerCandle);
        const reqEnd = s;

        if (!currentChunk) {
          currentChunk = { symbol: t.symbol, provider: t.provider, startTs: reqStart, endTs: reqEnd, trades: [t] };
        } else {
          const proposedEnd = Math.max(currentChunk.endTs, reqEnd);
          const proposedStart = Math.min(currentChunk.startTs, reqStart);
          if (proposedEnd - proposedStart <= MAX_SPAN_MS) {
            currentChunk.startTs = proposedStart;
            currentChunk.endTs = proposedEnd;
            currentChunk.trades.push(t);
          } else {
            chunks.push(currentChunk);
            currentChunk = { symbol: t.symbol, provider: t.provider, startTs: reqStart, endTs: reqEnd, trades: [t] };
          }
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }

    const promises = chunks.map((chunk) => limit(async () => {
      try {
        const result = await fetchSmartKlines(
          chunk.symbol,
          interval,
          1000,
          chunk.startTs,
          chunk.endTs,
          chunk.provider
        );

        if (result && result.klines.length > 0) {
          for (const trade of chunk.trades) {
            try {
              const timeStr = trade.entryDate || trade.date;
              const timestamp = new Date(timeStr).getTime();

              const tradeKlines = result.klines.filter(k => Number(k.time) <= timestamp);
              const recentKlines = tradeKlines.slice(-25);

              if (recentKlines.length >= 14) {
                const atr = calculator.calculateATR(recentKlines, 14);

                if (atr && !atr.isNaN()) {
                  journalState.updateEntry({
                    ...trade,
                    atrValue: atr,
                    provider: result.provider,
                  });
                } else {
                  failed++;
                }
              } else {
                failed++;
              }
            } catch {
              failed++;
            } finally {
              processed++;
              onProgress(
                processed,
                total,
                `Repariere ${trade.symbol} (${trade.date})...`,
              );
            }
          }
        } else {
          for (const trade of chunk.trades) {
            failed++;
            processed++;
            onProgress(
              processed,
              total,
              `Repariere ${trade.symbol} (${trade.date})...`,
            );
          }
        }
      } catch (e) {
        logger.error(
          "journal",
          `[DataRepair] Failed to repair ${chunk.symbol}`,
          e,
        );
        for (const trade of chunk.trades) {
          failed++;
          processed++;
          onProgress(
            processed,
            total,
            `Repariere ${trade.symbol} (${trade.date})...`,
          );
        }
      }
    }));

    await Promise.all(promises);

    const successCount = total - failed;
    onProgress(
      total,
      total,
      failed > 0
        ? `Reparatur abgeschlossen. ${successCount} erfolgreich, ${failed} fehlgeschlagen.`
        : "Reparatur abgeschlossen.",
    );
  },

  /**
   * Scans for trades that are closed (Won/Lost) but missing MFE or MAE.
   */
  scanForMissingMfeMae(): number {
    const trades = journalState.entries;
    let count = 0;
    for (const t of trades) {
      if (
        (t.status === "Won" || t.status === "Lost") &&
        (t.mfe === undefined || t.mae === undefined)
      ) {
        count++;
      }
    }
    return count;
  },

  /**
   * Repairs MFE/MAE by fetching historical data during the trade's lifetime.
   */
  async repairMfeMae(
    onProgress: (current: number, total: number, message: string) => void,
  ) {
    const allTrades = journalState.entries;
    const targets = allTrades.filter(
      (t) =>
        (t.status === "Won" || t.status === "Lost") &&
        (t.mfe === undefined || t.mae === undefined),
    );

    const total = targets.length;
    if (total === 0) {
      onProgress(0, 0, "Keine Trades für MFE/MAE-Reparatur.");
      return;
    }

    let processed = 0;
    let failed = 0;
    const Decimal = (await import("decimal.js")).default;

    // Use configured timeframe (requested by user to be configurable)
    // Default to 5m for MFE/MAE if not set, or use the repairTimeframe
    const interval = settingsState.repairTimeframe || "5m";

    const limit = pLimit(5); // Concurrency limit

    // Helper to parse interval to ms
    const parseIntervalMs = (inv: string) => {
      const unit = inv.slice(-1);
      const val = parseInt(inv.slice(0, -1)) || 1;
      switch(unit) {
        case 'm': return val * 60 * 1000;
        case 'h': return val * 60 * 60 * 1000;
        case 'd': return val * 24 * 60 * 60 * 1000;
        case 'w': return val * 7 * 24 * 60 * 60 * 1000;
        default: return 5 * 60 * 1000; // default 5m
      }
    };
    const msPerCandle = parseIntervalMs(interval);
    const MAX_SPAN_MS = 900 * msPerCandle; // safe limit < 1000

    // Group by symbol and provider
    const chunks: { symbol: string, provider?: "bitunix" | "bitget" | "custom", startTs: number, endTs: number, trades: typeof targets }[] = [];

    const symbolGroups = new Map<string, typeof targets>();
    for (const t of targets) {
      if (!t.entryDate || !t.exitDate) {
        failed++;
        processed++;
        onProgress(processed, total, `Skipped ${t.symbol}...`);
        continue;
      }
      const s = new Date(t.entryDate).getTime();
      const e = new Date(t.exitDate).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) {
        failed++;
        processed++;
        onProgress(processed, total, `Skipped ${t.symbol}...`);
        continue;
      }
      const k = `${t.symbol}_${t.provider || 'default'}`;
      if (!symbolGroups.has(k)) symbolGroups.set(k, []);
      symbolGroups.get(k)!.push(t);
    }

    for (const groupTrades of symbolGroups.values()) {
      // Sort by entry time
      groupTrades.sort((a, b) => new Date(a.entryDate!).getTime() - new Date(b.entryDate!).getTime());

      let currentChunk: typeof chunks[0] | null = null;
      for (const t of groupTrades) {
        const s = new Date(t.entryDate!).getTime();
        const e = new Date(t.exitDate!).getTime();

        if (!currentChunk) {
          currentChunk = { symbol: t.symbol, provider: t.provider, startTs: s, endTs: e, trades: [t] };
        } else {
          const proposedEnd = Math.max(currentChunk.endTs, e);
          if (proposedEnd - currentChunk.startTs <= MAX_SPAN_MS) {
            currentChunk.endTs = proposedEnd;
            currentChunk.trades.push(t);
          } else {
            chunks.push(currentChunk);
            currentChunk = { symbol: t.symbol, provider: t.provider, startTs: s, endTs: e, trades: [t] };
          }
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }

    const promises = chunks.map((chunk) => limit(async () => {
      try {
        const result = await fetchSmartKlines(
          chunk.symbol,
          interval,
          1000,
          chunk.startTs,
          chunk.endTs,
          chunk.provider
        );

        if (result && result.klines.length > 0) {
          for (const trade of chunk.trades) {
            try {
              const startTs = new Date(trade.entryDate!).getTime();
              const endTs = new Date(trade.exitDate!).getTime();

              const tradeKlines = result.klines.filter(k => {
                const kt = Number(k.time);
                return kt + msPerCandle > startTs && kt <= endTs;
              });

              if (tradeKlines.length > 0) {
                let highest = new Decimal(0);
                let lowest = new Decimal(tradeKlines[0].low);

                for (const k of tradeKlines) {
                  const h = new Decimal(k.high);
                  const l = new Decimal(k.low);
                  if (h.gt(highest)) highest = h;
                  if (l.lt(lowest)) lowest = l;
                  if (new Decimal(lowest).eq(0)) lowest = l;
                }

                const entryPrice = new Decimal(trade.entryPrice);
                let mfe = new Decimal(0);
                let mae = new Decimal(0);

                if (trade.tradeType === "Long") {
                  mfe = highest.minus(entryPrice);
                  mae = entryPrice.minus(lowest);
                } else {
                  mfe = entryPrice.minus(lowest);
                  mae = highest.minus(entryPrice);
                }

                journalState.updateEntry({
                  ...trade,
                  mfe: mfe,
                  mae: mae,
                  provider: result.provider,
                });
              } else {
                failed++;
              }
            } catch {
              failed++;
            } finally {
              processed++;
              onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);
            }
          }
        } else {
          for (const trade of chunk.trades) {
            failed++;
            processed++;
            onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== "apiErrors.symbolNotFound") {
          logger.error(
            "journal",
            `[DataRepair] MFE/MAE Err ${chunk.symbol}`,
            e,
          );
        }
        for (const trade of chunk.trades) {
          failed++;
          processed++;
          onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);
        }
      }
    }));

    await Promise.all(promises);

    const successCount = total - failed;
    onProgress(
      total,
      total,
      failed > 0
        ? `MFE/MAE Berechnungen fertig. ${successCount} erfolgreich, ${failed} fehlgeschlagen.`
        : "MFE/MAE Berechnungen fertig.",
    );
  },

  /**
   * Scans for symbols that do not match the clean format (e.g. uppercase, no separators).
   */
  scanForInvalidSymbols(): number {
    const trades = journalState.entries;
    let count = 0;
    for (const t of trades) {
      const clean = normalizeSymbol(t.symbol, "default");
      if (t.symbol !== clean) {
        count++;
      }
    }
    return count;
  },

  /**
   * Normalizes symbols to standard format (e.g. BTCUSDT).
   */
  async repairSymbols(
    onProgress: (current: number, total: number, message: string) => void,
  ) {
    const allTrades = journalState.entries;
    const targets = allTrades.filter(
      (t) => t.symbol !== normalizeSymbol(t.symbol, "default"),
    );

    const total = targets.length;
    if (total === 0) {
      onProgress(0, 0, "Symbole bereits sauber.");
      return;
    }

    for (const trade of targets) {
      const clean = normalizeSymbol(trade.symbol, "default");

      if (clean !== trade.symbol) {
        journalState.updateEntry({
          ...trade,
          symbol: clean,
        });
      }
    }

    onProgress(total, total, "Symbole bereinigt.");
  },
};
