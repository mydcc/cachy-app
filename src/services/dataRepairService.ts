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
import { apiService } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { logger } from "./logger";

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
    // Filter: If force is true, take all closed trades. Otherwise only those missing ATR.
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

    for (const trade of targets) {
      processed++;
      onProgress(
        processed,
        total,
        `Repariere ${trade.symbol} (${trade.date})...`,
      );

      try {
        // 1. Determine Timestamp
        // Use entryDate if available, otherwise just date
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

        // 2. Fetch Klines
        // We need 14 periods back for ATR. Fetching 25 to be safe.
        // Depending on the timeframe used. Assuming 15m or 1h?
        // The App usually uses the journal's selected timeframe preference,
        // but individual trades might not strictly store which timeframe they were taken on
        // unless we infer or pick a standard one (e.g. 15m is common for daytrading).
        // Let's assume '15m' as a safe default for ATR context if unknown.
        const interval = "15m";

        // EndTime = Trade Entry (we want the candle AT or BEFORE entry).
        // Bitunix API 'endTime' implies the window closes at 'endTime'.
        // So we ask for candles ending at 'timestamp'.
        const klines = await apiService.fetchBitunixKlines(
          normalizeSymbol(trade.symbol, "bitunix"),
          interval,
          25, // limit
          undefined, // startTime
          timestamp, // endTime
          "normal", // priority
        );

        if (klines && klines.length >= 15) {
          // 3. Calculate ATR
          const atr = calculator.calculateATR(klines, 14);

          if (atr && !atr.isNaN()) {
            // 4. Update Trade
            // We must create a new object or mutate usage journalState methods?
            // journalState is a class with array of $state objects.
            // We can mutate the trade object directly since it's a reference from the state array,
            // but it's cleaner to use the store's update action if strict.

            // However, since we are inside an async loop, let's just update the property
            // and trigger reactivity. Since 'entries' is a $state array,
            // mutating an element's property *should* be reactive if the element is also a $state proxy.
            // But usually deep reactivity works.
            // Alternatively, use journalState.updateEntry({...trade, atrValue: atr});

            journalState.updateEntry({
              ...trade,
              atrValue: atr,
            });
          } else {
            failed++;
          }
        } else {
          failed++;
        }
      } catch (e: any) {
        if (e.message !== "apiErrors.symbolNotFound") {
          logger.error(
            "journal",
            `[DataRepair] Failed to repair ${trade.symbol}`,
            e,
          );
        }
        failed++;
        // Continue with next trade
      }

      // 5. Rate Limit / Pacing
      // Wait 500ms between requests to be gentle
      // (RequestManager handles concurrency, but this sequential loop adds extra safety)
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
    const Decimal = (await import("decimal.js")).default; // Dynamic import or assume global if cleaner

    for (const trade of targets) {
      processed++;
      onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);

      try {
        if (!trade.entryDate || !trade.exitDate) {
          // Cannot calc without window
          failed++;
          continue;
        }

        const startTs = new Date(trade.entryDate).getTime();
        const endTs = new Date(trade.exitDate).getTime();

        if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) {
          failed++;
          continue;
        }

        // Use 5m candles for reasonable precision/limit balance
        const interval = "5m";
        // Bitunix limit is typically 500-1000.
        // Duration in minutes
        const durationMins = (endTs - startTs) / 60000;
        // If duration is very long, 5m might not fit in one request if limit is small.
        // Assuming standard fetch covers it or we accept partial precision (start of trade).
        // Actually fetchBitunixKlines usually allows specifying start/end.

        const klines = await apiService.fetchBitunixKlines(
          normalizeSymbol(trade.symbol, "bitunix"),
          interval,
          1000,
          startTs,
          endTs,
          "normal",
        );

        if (klines && klines.length > 0) {
          let highest = new Decimal(0);
          let lowest = new Decimal(klines[0].low);

          for (const k of klines) {
            const h = new Decimal(k.high);
            const l = new Decimal(k.low);
            if (h.gt(highest)) highest = h;
            if (l.lt(lowest)) lowest = l;
            // Initialize lowest correctly on first iteration if needed
            if (new Decimal(lowest).eq(0)) lowest = l;
          }

          // MFE/MAE Calc
          // Long: MFE = High - Entry, MAE = Entry - Low
          // Short: MFE = Entry - Low, MAE = High - Entry
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

          // Ensure positive values usually, or strictly mathematical?
          // Usually MFE is positive gain, MAE is max draw down against you (also positive number representing distance).

          journalState.updateEntry({
            ...trade,
            mfe: mfe,
            mae: mae,
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
      const clean = normalizeSymbol(t.symbol, "default"); // "BTCUSDT"
      // If current symbol is different from clean version
      // Basic check: looks like "BTC/USDT" or "btc"
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
      // Instant update, no API needed
      const clean = normalizeSymbol(trade.symbol, "default");

      // Only update if changed
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
