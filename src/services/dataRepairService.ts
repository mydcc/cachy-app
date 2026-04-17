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
import { apiService, type Kline } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { logger } from "./logger";
import { settingsState } from "../stores/settings.svelte";

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

  for (const p of candidates) {
    try {
      let klines: Kline[] = [];
      if (p === "bitunix") {
        klines = await apiService.fetchBitunixKlines(
          normalizeSymbol(symbol, "bitunix"),
          interval,
          limit,
          start,
          end,
          "normal",
        );
      } else {
        klines = await apiService.fetchBitgetKlines(
          normalizeSymbol(symbol, "bitget"),
          interval,
          limit,
          start,
          end,
          "normal",
        );
      }

      if (klines && klines.length > 0) {
        return { klines, provider: p };
      }
    } catch (e: any) {
      const isNotFound =
        e.message === "apiErrors.symbolNotFound" || e.status === 404;
      if (!isNotFound) {
        logger.warn(
          "journal",
          `[DataRepair] ${p} fetch failed for ${symbol}: ${e.message}`,
        );
      }
    }
  }
  return null;
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

    for (const trade of targets) {
      processed++;
      onProgress(
        processed,
        total,
        `Repariere ${trade.symbol} (${trade.date})...`,
      );

      try {
        const timeStr = trade.entryDate || trade.date;
        const timestamp = new Date(timeStr).getTime();

        if (isNaN(timestamp)) {
          logger.warn(
            "journal",
            `[DataRepair] Invalid date for trade ${trade.id}, skipping.`,
          );
          failed++;
          continue;
        }

        const result = await fetchSmartKlines(
          trade.symbol,
          interval,
          25,
          undefined,
          timestamp,
          trade.provider,
        );

        if (result && result.klines.length >= 14) {
          const atr = calculator.calculateATR(result.klines, 14);

          if (atr && !atr.isNaN()) {
            journalState.updateEntry({
              ...trade,
              atrValue: atr,
              provider: result.provider, // Update provider for future ref
            });
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      } catch (e: any) {
        logger.error(
          "journal",
          `[DataRepair] Failed to repair ${trade.symbol}`,
          e,
        );
        failed++;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

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
    // User asked "Timeframe soll konfigurierbar sein" for ATR values, but mentioned maintenance code generally.
    // I'll use the same setting.
    const interval = settingsState.repairTimeframe || "5m";

    for (const trade of targets) {
      processed++;
      onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);

      try {
        if (!trade.entryDate || !trade.exitDate) {
          failed++;
          continue;
        }

        const startTs = new Date(trade.entryDate).getTime();
        const endTs = new Date(trade.exitDate).getTime();

        if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) {
          failed++;
          continue;
        }

        const result = await fetchSmartKlines(
          trade.symbol,
          interval,
          1000,
          startTs,
          endTs,
          trade.provider,
        );

        if (result && result.klines.length > 0) {
          let highest = new Decimal(0);
          let lowest = new Decimal(result.klines[0].low);

          for (const k of result.klines) {
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
      } catch (e: any) {
        if (e.message !== "apiErrors.symbolNotFound") {
          logger.error(
            "journal",
            `[DataRepair] MFE/MAE Err ${trade.symbol}`,
            e,
          );
        }
        failed++;
      }

      await new Promise((r) => setTimeout(r, 500));
    }

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

    let processed = 0;
    for (const trade of targets) {
      processed++;
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
