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

import { parseTimestamp } from "../utils/utils";
import { CONSTANTS } from "../lib/constants";
import { journalState } from "../stores/journal.svelte";
import { uiState } from "../stores/ui.svelte";
import { settingsState } from "../stores/settings.svelte";
import { apiService } from "./apiService";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";
import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { trackCustomEvent } from "./trackingService";
import { browser } from "$app/environment";
import { calculator } from "../lib/calculator";
import { StorageHelper } from "../utils/storageHelper";
import { serializationService } from "./serializationService";

// --- Helper Functions for Optimization ---

function calculateInterval(posTime: number, closeTime: number): string {
  const durationMin = (closeTime - posTime) / 60000;
  if (durationMin > 1000) {
    if (durationMin <= 5000) return "5m";
    else if (durationMin <= 15000) return "15m";
    else return "1h";
  }
  return "1m";
}

export async function fetchBatchedKlines(trades: any[]) {
  const prepared = trades.map((p) => {
    const posTime = parseTimestamp(p.ctime);
    let closeTime = parseTimestamp(p.mtime || p.ctime);
    if (closeTime <= 0) closeTime = Date.now();
    const interval = calculateInterval(posTime, closeTime);
    return { ...p, _posTime: posTime, _closeTime: closeTime, _interval: interval };
  });

  const groups = new Map<string, typeof prepared>();
  for (const item of prepared) {
    if (item._posTime <= 0 || item._closeTime <= item._posTime) continue;
    const key = `${item.symbol}:${item._interval}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const results = new Map<string, any[]>(); // key -> Array of {start, end, klines}
  const fetchTasks: Array<{symbol: string, interval: string, start: number, end: number, key: string}> = [];

  for (const [key, items] of groups.entries()) {
    const [symbol, interval] = key.split(":");
    items.sort((a, b) => a._posTime - b._posTime);

    const intervalMs =
      interval === "1m"
        ? 60000
        : interval === "5m"
        ? 300000
        : interval === "15m"
        ? 900000
        : 3600000;

    let currentStart = items[0]._posTime;
    let currentEnd = items[0]._closeTime;

    const pushTask = (s: number, e: number) => {
        fetchTasks.push({ symbol, interval, start: s, end: e, key });
    };

    for (let i = 1; i < items.length; i++) {
        const item = items[i];
        const potentialEnd = Math.max(currentEnd, item._closeTime);
        const candlesNeeded = (potentialEnd - currentStart) / intervalMs;

        if (candlesNeeded <= 1000) {
            currentEnd = potentialEnd;
        } else {
            pushTask(currentStart, currentEnd);
            currentStart = item._posTime;
            currentEnd = item._closeTime;
        }
    }
    pushTask(currentStart, currentEnd);
  }

  // Execute all tasks concurrently
  await Promise.all(fetchTasks.map(async (task) => {
      try {
          const klines = await apiService.fetchBitunixKlines(task.symbol, task.interval, 1000, task.start, task.end, "normal", 30000);
          if (!results.has(task.key)) results.set(task.key, []);
          results.get(task.key)!.push({ start: task.start, end: task.end, klines });
      } catch (err) {
          console.warn(`[Sync] Failed to fetch batch klines for ${task.symbol}`, err);
      }
  }));

  return {
    getKlines: (symbol: string, interval: string, start: number, end: number) => {
        const key = `${symbol}:${interval}`;
        const blocks = results.get(key);
        if (!blocks) return [];
        // Find block that covers the range. Since we might have multiple blocks,
        // we look for one that covers the start time and hopefully the end time.
        // Or we just search for klines across all blocks?
        // Simpler: Just filter from all blocks for that key.
        // There shouldn't be too many blocks or overlap issues since we sorted.
        const allKlines = blocks.flatMap(b => b.klines || []);
        // Deduplicate? Bitunix might return overlapping candles if we requested so.
        // But for filtering, just checking time is enough.
        return allKlines.filter((k: any) => k.time >= start && k.time <= end);
    }
  };
}

export const syncService = {
  // Private static lock to prevent concurrent sync operations
  _syncLock: false,

  syncBitunixPositions: async () => {
    const settings = settingsState;
    if (!settings.isPro) return;
    if (!settings.apiKeys.bitunix.key || !settings.apiKeys.bitunix.secret) {
      uiState.showError("settings.apiKeysRequired");
      return;
    }

    // Atomic lock check and set - prevents race conditions
    if (syncService._syncLock) {
      console.warn("[Sync] Sync already in progress (locked), skipping...");
      return;
    }
    syncService._syncLock = true;

    uiState.update((s) => ({ ...s, isPriceFetching: true, isSyncing: true }));
    uiState.setSyncProgress({ total: 0, current: 0, step: "Initializing..." });

    try {
      // 1. Fetch History Positions
      const historyResponse = await fetch("/api/sync/positions-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
          limit: 500,
        }),
      });
      if (!historyResponse.ok) throw new Error("apiErrors.fetchFailed");
      const historyResult = await historyResponse.json();
      if (historyResult.error) throw new Error("apiErrors.fetchFailed");
      const historyPositions = historyResult.data;

      // 2. Fetch Pending Positions
      const pendingResponse = await fetch("/api/sync/positions-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
        }),
      });
      if (!pendingResponse.ok) throw new Error("apiErrors.fetchFailed");
      const pendingResult = await pendingResponse.json();
      const pendingPositions = Array.isArray(pendingResult.data)
        ? pendingResult.data
        : [];

      // 3. Fetch Orders
      const orderResponse = await fetch("/api/sync/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
          limit: 500,
        }),
      });

      let orders: any[] = [];
      let isPartialSync = false;
      try {
        if (!orderResponse.ok) throw new Error("apiErrors.fetchFailed");
        const orderResult = await orderResponse.json();
        orders = orderResult.data || [];
      } catch (e) {
        console.warn("Order sync failed (non-critical):", e);
        isPartialSync = true;
      }

      // --- Processing Logic ---

      let newEntries: JournalEntry[] = [];
      let addedCount = 0;
      const symbolSlMap: Record<string, any[]> = {};

      // Build SL Map
      orders.forEach((o: any) => {
        if (
          o.type === "STOP_MARKET" ||
          o.type === "TAKE_PROFIT_MARKET" ||
          o.type === "STOP_LIMIT"
        ) {
          if (!symbolSlMap[o.symbol]) symbolSlMap[o.symbol] = [];
          symbolSlMap[o.symbol].push({
            slPrice: new Decimal(o.stopPrice || o.triggerPrice || 0),
            ctime: parseTimestamp(o.createTime || o.updateTime),
          });
        }
      });

      // Sort SL candidates
      Object.keys(symbolSlMap).forEach((k) => {
        symbolSlMap[k].sort((a, b) => a.ctime - b.ctime);
      });

      // Process Pending (Open) Positions - No Changes Here
      for (const p of pendingPositions) {
        const uniqueId = String(p.positionId || `OPEN-${p.symbol}-${p.ctime}`);

        const exists = journalState.entries.some(
          (e) => String(e.tradeId) === uniqueId,
        );
        if (exists) continue;

        const funding = new Decimal(p.funding || 0);
        const fee = new Decimal(0); // Fees usually not final for open pos

        newEntries.push({
          id: Date.now() + Math.random(),
          tradeId: uniqueId,
          date: new Date(parseTimestamp(p.ctime)).toISOString(),
          symbol: p.symbol,
          tradeType: (p.side || "").toLowerCase().includes("sell")
            ? "short"
            : "long",
          status: "Open",
          leverage: new Decimal(p.leverage || 0),
          entryPrice: new Decimal(p.entryPrice || 0),
          exitPrice: new Decimal(0), // Open
          stopLossPrice: new Decimal(0), // Pending
          totalNetProfit: new Decimal(p.unrealizedPNL || 0), // Unrealized
          totalFees: fee.abs().plus(funding.abs()),
          notes: `Open Position. Funding: ${funding.toFixed(4)}`,
          positionSize: new Decimal(p.qty || p.size || 0),
          isManual: false,
          totalRR: new Decimal(0),
          accountSize: new Decimal(0),
          riskPercentage: new Decimal(0),
          fees: new Decimal(0),
          riskAmount: new Decimal(0),
          maxPotentialProfit: new Decimal(0),
          targets: [],
          calculatedTpDetails: [],
          tags: [],
          fundingFee: funding,
        });
        addedCount++;
      }

      // --- Process History (Optimized Parallel Batching) ---
      const currentJournal = journalState.entries;
      const existingHistoryIds = new Set(
        currentJournal.map((j) => String(j.tradeId || j.id)),
      );

      const filteredHistory = historyPositions.filter((p: any) => {
        const uniqueId = String(p.positionId || `HIST-${p.symbol}-${p.ctime}`);
        return !existingHistoryIds.has(uniqueId);
      });

      const totalItems = filteredHistory.length;
      let processedItems = 0;
      uiState.setSyncProgress({
        total: totalItems,
        current: 0,
        step: "Processing History",
      });

      // Batch size for parallel kline requests - INCREASED FOR OPTIMIZATION
      const BATCH_SIZE = 50;

      for (let i = 0; i < filteredHistory.length; i += BATCH_SIZE) {
        const batch = filteredHistory.slice(i, i + BATCH_SIZE);

        // 1. Pre-fetch klines for the entire batch
        uiState.setSyncProgress({
            total: totalItems,
            current: processedItems,
            step: `Fetching Data ${processedItems + 1}-${Math.min(processedItems + BATCH_SIZE, totalItems)}`,
        });

        const klineCache = await fetchBatchedKlines(batch);

        const batchPromises = batch.map(async (p: any, batchIndex: number) => {
          // Update progress before processing each trade
          const currentIndex = i + batchIndex;

          const uniqueId = String(
            p.positionId || `HIST-${p.symbol}-${p.ctime}`,
          );
          const realizedPnl = new Decimal(
            p.realizedPNL || p.realizedPnl || p.pnl || 0,
          );
          const funding = new Decimal(p.funding || 0);
          const fee = new Decimal(p.fee || 0);
          const entryPrice = new Decimal(p.entryPrice || 0);
          const closePrice = new Decimal(p.closePrice || 0);
          const qty = new Decimal(p.maxQty || p.qty || p.amount || 0);
          const netPnl = realizedPnl.plus(funding).minus(fee.abs());
          const posTime = parseTimestamp(p.ctime);
          let closeTime = parseTimestamp(p.mtime || p.ctime);
          if (closeTime <= 0) closeTime = Date.now();

          // Find SL
          let stopLoss = new Decimal(p.stopLossPrice || p.sl || 0);
          if (stopLoss.isZero()) {
            const candidates = symbolSlMap[p.symbol];
            if (candidates && posTime > 0) {
              const tolerance = 5000;
              for (let j = candidates.length - 1; j >= 0; j--) {
                if (
                  Math.abs(candidates[j].ctime - posTime) <
                  60000 * 60 * 24 * 60
                ) {
                  // 60 day window
                  if (candidates[j].ctime <= posTime + tolerance) {
                    stopLoss = candidates[j].slPrice;
                    break;
                  }
                }
              }
            }
          }

          // MAE/MFE & ATR
          let mae, mfe, efficiency, atrValue;
          try {
            if (posTime > 0 && closeTime > posTime) {
              const interval = calculateInterval(posTime, closeTime);

              // Use cached klines
              const klines = klineCache.getKlines(p.symbol, interval, posTime, closeTime);

              if (klines?.length > 0) {
                let maxHigh = new Decimal(0),
                  minLow = new Decimal(Infinity);
                klines.forEach((k: any) => {
                  if (k.high.gt(maxHigh)) maxHigh = k.high;
                  if (k.low.lt(minLow)) minLow = k.low;
                });
                const isShort =
                  (p.side || "").toLowerCase().includes("sell") ||
                  (p.side || "").toLowerCase().includes("short");

                if (minLow.isFinite() && maxHigh.gt(0)) {
                  if (isShort) {
                    mae = Decimal.max(0, maxHigh.minus(entryPrice));
                    mfe = Decimal.max(0, entryPrice.minus(minLow));
                  } else {
                    mae = Decimal.max(0, entryPrice.minus(minLow));
                    mfe = Decimal.max(0, maxHigh.minus(entryPrice));
                  }

                  // ATR calculation using the same klines
                  // Note: calculateATR expects Kline[] which matches
                  atrValue = calculator.calculateATR(klines, 14);

                  if (mfe.gt(0) && qty.gt(0)) {
                    efficiency = netPnl.div(mfe.times(qty));
                  } else if (qty.gt(0)) {
                    efficiency = netPnl.gt(0) ? new Decimal(1) : new Decimal(0);
                  }
                }
              }
            }
          } catch (err) {
            console.warn(`MAE/MFE failed for ${p.symbol}:`, err);
          }

          let riskAmount = new Decimal(0),
            totalRR = new Decimal(0);
          if (stopLoss.gt(0) && entryPrice.gt(0) && qty.gt(0)) {
            riskAmount = entryPrice.minus(stopLoss).abs().times(qty);
            if (riskAmount.gt(0)) totalRR = netPnl.div(riskAmount);
          }

          addedCount++;

          return {
            id: Date.now() + Math.random(),
            tradeId: uniqueId,
            date: new Date(closeTime).toISOString(),
            entryDate:
              posTime > 0 ? new Date(posTime).toISOString() : undefined,
            symbol: p.symbol,
            tradeType: (p.side || "").toLowerCase().includes("sell")
              ? "short"
              : "long",
            status: netPnl.gt(0) ? "Won" : "Lost",
            leverage: new Decimal(p.leverage || 0),
            entryPrice,
            exitPrice: closePrice,
            stopLossPrice: stopLoss,
            mae,
            mfe,
            efficiency,
            totalRR,
            totalNetProfit: netPnl,
            riskAmount,
            totalFees: fee.abs().plus(funding.abs()),
            notes: `Synced Position. Funding: ${funding.toFixed(4)}`,
            isManual: false,
            positionSize: qty,
            accountSize: new Decimal(0),
            riskPercentage: new Decimal(0),
            fees: new Decimal(0),
            maxPotentialProfit: new Decimal(0),
            targets: [],
            calculatedTpDetails: [],
            tags: [],
            fundingFee: funding,
            atrValue,
            exitDate: new Date(closeTime).toISOString(),
          };
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter(Boolean);

        // Add trades to journal immediately (streaming/incremental update)
        if (validResults.length > 0) {
          const currentJournalState = journalState.entries;
          const keptJournal = currentJournalState.filter(
            (j) => !(j.isManual === false && j.status === "Open"),
          );
          const updatedJournal = [...keptJournal, ...validResults];
          updatedJournal.sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );

          journalState.set(updatedJournal);
          await syncService.saveJournal(updatedJournal);
        }

        newEntries.push(...validResults);

        // Anti-Rate-Limit delay between batches
        if (i + BATCH_SIZE < filteredHistory.length) {
          await new Promise((r) => setTimeout(r, 600));
        }

        processedItems += batch.length;
      }

      // Final feedback - trades already added incrementally
      if (addedCount > 0) {
        trackCustomEvent("Sync", "BitunixHistory", "Success", addedCount);
        if (isPartialSync) uiState.showError(get(_)("apiErrors.syncIncomplete"));
        else uiState.showFeedback("save", 2000);
      } else {
        trackCustomEvent("Sync", "BitunixHistory", "NoNewData");
        uiState.showError(
          isPartialSync
            ? get(_)("apiErrors.syncIncomplete")
            : get(_)("apiErrors.syncNoNewData"),
        );
      }
    } catch (e: any) {
      console.error("Sync error:", e);
      trackCustomEvent("Sync", "BitunixHistory", "Error");
      const errMsg = e.message.startsWith("apiErrors.") ? get(_)(e.message) : e.message;
      uiState.showError(get(_)("apiErrors.syncFailed", { values: { error: errMsg } }));
    } finally {
      syncService._syncLock = false; // Release lock
      uiState.update((s) => ({
        ...s,
        isPriceFetching: false,
        isSyncing: false,
      }));
      uiState.setSyncProgress(null);
    }
  },

  saveJournal: async (d: JournalEntry[]) => {
    if (!browser) return;
    try {
      const data = await serializationService.stringifyAsync(d);
      const success = StorageHelper.safeSave(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        data,
      );

      if (!success) {
        uiState.showError("storage.journalSaveFailed");
      }
    } catch (e) {
      uiState.showError(
        "Fehler beim Speichern des Journals. Der lokale Speicher ist möglicherweise voll oder blockiert.",
      );
    }
  },
};
