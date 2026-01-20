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
import { trackCustomEvent } from "./trackingService";
import { browser } from "$app/environment";
import { calculator } from "../lib/calculator";
import { StorageHelper } from "../utils/storageHelper";

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
      console.warn('[Sync] Sync already in progress (locked), skipping...');
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
      const historyResult = await historyResponse.json();
      if (historyResult.error) throw new Error(historyResult.error);
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
        const orderResult = await orderResponse.json();
        if (orderResult.isPartial) isPartialSync = true;
        if (!orderResult.error && Array.isArray(orderResult.data)) {
          orders = orderResult.data;
        }
      } catch (err) {
        console.warn("Failed to fetch orders:", err);
      }

      // Lookup for SL
      const symbolSlMap: Record<
        string,
        Array<{ ctime: number; slPrice: Decimal }>
      > = {};
      orders.forEach((o: any) => {
        let sl = new Decimal(
          o.slPrice || o.stopLossPrice || o.triggerPrice || 0,
        );
        const t = parseTimestamp(o.createTime || o.ctime);
        if (sl.gt(0) && o.symbol) {
          if (!symbolSlMap[o.symbol]) symbolSlMap[o.symbol] = [];
          symbolSlMap[o.symbol].push({ ctime: t, slPrice: sl });
        }
      });
      Object.values(symbolSlMap).forEach((list) =>
        list.sort((a, b) => a.ctime - b.ctime),
      );

      const newEntries: JournalEntry[] = [];
      let addedCount = 0;

      // Process Pending (Simplified)
      for (const p of pendingPositions) {
        const side =
          (p.side || "").toLowerCase().includes("sell") ||
            (p.side || "").toLowerCase().includes("short")
            ? "short"
            : "long";
        const uniqueId = `OPEN-${p.positionId || p.symbol + "-" + side}`;

        const entryPrice = new Decimal(p.avgOpenPrice || p.entryPrice || 0);
        const fee = new Decimal(p.fee || 0);
        const funding = new Decimal(p.funding || 0);
        const unrealizedPnl = new Decimal(p.unrealizedPNL || 0);
        let dateTs = parseTimestamp(p.ctime);
        if (dateTs <= 0) dateTs = Date.now();

        let stopLoss = new Decimal(0);
        const candidates = symbolSlMap[p.symbol];
        if (candidates && candidates.length > 0)
          stopLoss = candidates[candidates.length - 1].slPrice;

        newEntries.push({
          id: Date.now() + Math.random(),
          tradeId: uniqueId,
          date: new Date(dateTs).toISOString(),
          entryDate: new Date(dateTs).toISOString(),
          symbol: p.symbol,
          tradeType: side,
          status: "Open",
          leverage: new Decimal(p.leverage || 0),
          entryPrice,
          stopLossPrice: stopLoss,
          totalNetProfit: unrealizedPnl.minus(fee).plus(funding),
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

      // Batch size for parallel kline requests
      const BATCH_SIZE = 3;
      for (let i = 0; i < filteredHistory.length; i += BATCH_SIZE) {
        const batch = filteredHistory.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (p: any, batchIndex: number) => {
          // Update progress before processing each trade
          const currentIndex = i + batchIndex;
          uiState.setSyncProgress({
            total: totalItems,
            current: currentIndex,
            step: `Loading ${currentIndex + 1}/${totalItems}`,
          });

          // ... (rest of the map remains the same, but I need to include it for the tool)
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
              // Adaptive interval based on duration
              const durationMin = (closeTime - posTime) / 60000;
              let interval = "1m";
              if (durationMin > 1000) {
                if (durationMin <= 5000) interval = "5m";
                else if (durationMin <= 15000) interval = "15m";
                else interval = "1h";
              }

              const klines = await apiService.fetchBitunixKlines(
                p.symbol,
                interval,
                1000,
                posTime,
                closeTime,
                "normal",
                30000,
              );
              if (klines?.length > 0) {
                let maxHigh = new Decimal(0),
                  minLow = new Decimal(Infinity);
                klines.forEach((k) => {
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
                  const atrValue = calculator.calculateATR(klines, 14);

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

          // Update progress after processing
          uiState.setSyncProgress({
            total: totalItems,
            current: currentIndex + 1,
            step: `Loaded ${currentIndex + 1}/${totalItems}`,
          });

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
          syncService.saveJournal(updatedJournal);
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
        if (isPartialSync) uiState.showError("Sync unvollständig (Timeout).");
        else uiState.showFeedback("save", 2000);
      } else {
        trackCustomEvent("Sync", "BitunixHistory", "NoNewData");
        uiState.showError(
          isPartialSync
            ? "Sync unvollständig. Keine neuen Positionen."
            : "Keine neuen Positionen gefunden.",
        );
      }
    } catch (e: any) {
      console.error("Sync error:", e);
      trackCustomEvent("Sync", "BitunixHistory", "Error");
      uiState.showError("Sync failed: " + e.message);
    } finally {
      syncService._syncLock = false; // Release lock
      uiState.update((s) => ({ ...s, isPriceFetching: false, isSyncing: false }));
      uiState.setSyncProgress(null);
    }
  },

  saveJournal: (d: JournalEntry[]) => {
    if (!browser) return;
    try {
      const data = JSON.stringify(d);
      const success = StorageHelper.safeSave(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        data
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
