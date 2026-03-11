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

  // Fire all candidates concurrently.  We want:
  //  1. Priority – prefer candidates[0] over candidates[1] when both succeed.
  //  2. Speed   – don't block on a slow/timing-out provider when the other
  //               already succeeded.
  //  3. Logging – always log non-404 failures, even when another provider won.
  //
  // Approach: wrap each fetch in a promise that stores its result, then race
  // them.  Once any promise settles we check whether we can return early
  // (the priority candidate succeeded, or the only remaining candidate
  // settled).  A background "settled" promise handles deferred error logging.

  const fetchOne = async (
    p: "bitunix" | "bitget",
  ): Promise<{ klines: Kline[]; provider: "bitunix" | "bitget" }> => {
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

    throw new Error("apiErrors.symbolNotFound");
  };

  // Single candidate – no racing needed.
  if (candidates.length === 1) {
    try {
      return await fetchOne(candidates[0]);
    } catch (e: any) {
      const isNotFound =
        e?.message === "apiErrors.symbolNotFound" || e?.status === 404;
      if (!isNotFound) {
        logger.warn(
          "journal",
          `[DataRepair] ${candidates[0]} fetch failed for ${symbol}: ${e?.message ?? String(e)}`,
        );
      }
      return null;
    }
  }

  // Multiple candidates – race them, but respect priority.
  // Each promise is wrapped so it never rejects; results carry their own status.
  type Settled = { status: "fulfilled"; value: { klines: Kline[]; provider: "bitunix" | "bitget" }; provider: "bitunix" | "bitget" }
    | { status: "rejected"; reason: any; provider: "bitunix" | "bitget" };

  const settled: (Settled | undefined)[] = new Array(candidates.length);

  const promises: Promise<Settled>[] = candidates.map((p, idx) =>
    fetchOne(p).then(
      (value): Settled => {
        const r = { status: "fulfilled" as const, value, provider: p };
        settled[idx] = r;
        return r;
      },
      (reason): Settled => {
        const r = { status: "rejected" as const, reason, provider: p };
        settled[idx] = r;
        return r;
      },
    ),
  );

  // Helper to log a single failure if it's not a simple 404/not-found.
  // Track already-logged results to avoid duplicate warnings.
  const logged = new Set<Settled>();
  const logFailure = (r: Settled) => {
    if (r.status === "rejected" && !logged.has(r)) {
      logged.add(r);
      const err = r.reason;
      const isNotFound =
        err?.message === "apiErrors.symbolNotFound" || err?.status === 404;
      if (!isNotFound) {
        logger.warn(
          "journal",
          `[DataRepair] ${r.provider} fetch failed for ${symbol}: ${err?.message ?? String(err)}`,
        );
      }
    }
  };

  // Race: returns as soon as any candidate settles.
  const winner = await Promise.race(promises);

  if (winner.status === "fulfilled") {
    // A provider succeeded.  Check whether it's the priority candidate
    // or whether the priority candidate already settled too.
    const priorityResult = settled[0];

    if (priorityResult?.status === "fulfilled") {
      // Priority candidate succeeded (either it *was* the winner, or it
      // settled before we got here) – always prefer it.
      // Log remaining failures asynchronously.
      Promise.allSettled(promises).then((all) =>
        all.forEach((a) => { if (a.status === "fulfilled") logFailure(a.value); }),
      );
      return priorityResult.value;
    }

    // The winner is a fallback candidate, and priority hasn't settled yet.
    // Return the fallback immediately – don't block on a slow priority provider.
    // Log remaining (including the still-in-flight priority) asynchronously.
    Promise.allSettled(promises).then((all) =>
      all.forEach((a) => { if (a.status === "fulfilled") logFailure(a.value); }),
    );
    return winner.value;
  }

  // The first to settle was a failure.  Wait for the rest.
  logFailure(winner);

  const remaining = promises.filter((_, idx) => settled[idx] === undefined || settled[idx] !== winner);
  const rest = await Promise.all(remaining);

  // Pick the first successful result in candidate priority order.
  // Build a full list of settled results ordered by candidate index.
  const allSettled: Settled[] = candidates.map((_, idx) => settled[idx]!);

  for (const r of allSettled) {
    if (r.status === "fulfilled") {
      // Log other failures asynchronously.
      Promise.allSettled(promises).then((all) =>
        all.forEach((a) => { if (a.status === "fulfilled") logFailure(a.value); }),
      );
      return r.value;
    }
  }

  // All failed – log any we haven't logged yet.
  for (const r of rest) {
    if (r !== winner) logFailure(r);
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

    const limit = pLimit(5); // Concurrency limit

    const promises = targets.map((trade) => limit(async () => {
      try {
        const timeStr = trade.entryDate || trade.date;
        const timestamp = new Date(timeStr).getTime();

        if (isNaN(timestamp)) {
          logger.warn(
            "journal",
            `[DataRepair] Invalid date for trade ${trade.id}, skipping.`,
          );
          failed++;
        } else {
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
        }
      } catch (e: any) {
        logger.error(
          "journal",
          `[DataRepair] Failed to repair ${trade.symbol}`,
          e,
        );
        failed++;
      } finally {
        processed++;
        onProgress(
          processed,
          total,
          `Repariere ${trade.symbol} (${trade.date})...`,
        );
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

    const promises = targets.map((trade) => limit(async () => {
      try {
        if (!trade.entryDate || !trade.exitDate) {
          failed++;
        } else {
          const startTs = new Date(trade.entryDate).getTime();
          const endTs = new Date(trade.exitDate).getTime();

          if (isNaN(startTs) || isNaN(endTs) || endTs <= startTs) {
            failed++;
          } else {
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
          }
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
      } finally {
        processed++;
        onProgress(processed, total, `MFE/MAE für ${trade.symbol}...`);
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
