import { get } from "svelte/store";
import { parseTimestamp } from "../utils/utils";
import { CONSTANTS } from "../lib/constants";
import { journalStore } from "../stores/journalStore";
import { uiStore } from "../stores/uiStore";
import { settingsStore } from "../stores/settingsStore";
import { apiService } from "./apiService";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";
import { trackCustomEvent } from "./trackingService";
import { browser } from "$app/environment";

export const syncService = {
  syncBitunixPositions: async () => {
    const settings = get(settingsStore);
    if (!settings.isPro) return;
    if (!settings.apiKeys.bitunix.key || !settings.apiKeys.bitunix.secret) {
      uiStore.showError("settings.apiKeysRequired");
      return;
    }

    uiStore.update((s) => ({ ...s, isPriceFetching: true }));

    try {
      // 1. Fetch History Positions (The Truth about closed trades)
      const historyResponse = await fetch("/api/sync/positions-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
          limit: 100,
        }),
      });
      const historyResult = await historyResponse.json();
      if (historyResult.error) throw new Error(historyResult.error);
      const historyPositions = historyResult.data;

      // 2. Fetch Pending Positions (Open Trades)
      const pendingResponse = await fetch("/api/sync/positions-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
        }),
      });
      const pendingResult = await pendingResponse.json();
      // Pending positions might fail if empty, but we check array
      const pendingPositions = Array.isArray(pendingResult.data)
        ? pendingResult.data
        : [];

      // 3. Fetch Orders (Still needed to find initial Stop Loss for R-Calc)
      const orderResponse = await fetch("/api/sync/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.apiKeys.bitunix.key,
          apiSecret: settings.apiKeys.bitunix.secret,
          limit: 100,
        }),
      });

      let orders: any[] = [];
      let isPartialSync = false;
      try {
        const orderResult = await orderResponse.json();
        if (orderResult.isPartial) {
          uiStore.showError(
            "Sync unvollständig: Server-Timeout. Einige historische Daten fehlen möglicherweise."
          );
        }
        if (!orderResult.error && Array.isArray(orderResult.data)) {
          orders = orderResult.data;
          if (orderResult.isPartial) {
            isPartialSync = true;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch orders:", err);
      }

      // --- Pre-process orders to create a Symbol -> Orders(SL) lookup ---
      const symbolSlMap: Record<
        string,
        Array<{ ctime: number; slPrice: Decimal }>
      > = {};

      orders.forEach((o: any) => {
        let sl = new Decimal(0);
        if (o.slPrice) sl = new Decimal(o.slPrice);
        else if (o.stopLossPrice) sl = new Decimal(o.stopLossPrice);
        else if (o.triggerPrice) sl = new Decimal(o.triggerPrice);

        const t = parseTimestamp(o.createTime || o.ctime);

        if (sl.gt(0) && o.symbol) {
          if (!symbolSlMap[o.symbol]) symbolSlMap[o.symbol] = [];
          symbolSlMap[o.symbol].push({ ctime: t, slPrice: sl });
        }
      });
      Object.values(symbolSlMap).forEach((list) =>
        list.sort((a, b) => a.ctime - b.ctime)
      );
      // ------------------------------------------------------------------

      // Cleanup logic prepared, but we execute it ONLY after we successfully processed the new data
      // to prevent data loss in case of logic errors during processing.
      const newEntries: JournalEntry[] = [];
      let addedCount = 0;

      // --- Process Pending Positions (Open) ---
      const processedPendingIds = new Set<string>();

      for (const p of pendingPositions) {
        const side =
          (p.side || "").toLowerCase().includes("sell") ||
            (p.side || "").toLowerCase().includes("short")
            ? "short"
            : "long";
        // Unique ID for pending: "OPEN-{positionId}" or "OPEN-{symbol}-{side}" if no ID to support Hedge Mode
        const uniqueId = `OPEN-${p.positionId || p.symbol + "-" + side}`;
        processedPendingIds.add(uniqueId);

        const entryPrice = new Decimal(p.avgOpenPrice || p.entryPrice || 0);
        const unrealizedPnl = new Decimal(p.unrealizedPNL || 0);
        const funding = new Decimal(p.funding || 0);
        const fee = new Decimal(p.fee || 0);
        const size = new Decimal(p.qty || p.size || 0);

        // Find SL for Open Position (Look for recent orders)
        let stopLoss = new Decimal(0);
        const candidates = symbolSlMap[p.symbol];
        if (candidates && candidates.length > 0) {
          // Get latest SL
          stopLoss = candidates[candidates.length - 1].slPrice;
        }

        // Parse creation time
        let dateTs = parseTimestamp(p.ctime);
        if (dateTs <= 0) dateTs = Date.now();

        const entry: JournalEntry = {
          id: Date.now() + Math.random(),
          tradeId: uniqueId,
          date: new Date(dateTs).toISOString(),
          entryDate: new Date(dateTs).toISOString(), // For duration calculation
          symbol: p.symbol,
          tradeType:
            (p.side || "").toLowerCase().includes("sell") ||
              (p.side || "").toLowerCase().includes("short")
              ? "short"
              : "long",
          status: "Open",

          accountSize: new Decimal(0),
          riskPercentage: new Decimal(0),
          leverage: new Decimal(p.leverage || 0),
          fees: new Decimal(0), // Estimated % not known, using absolute below

          entryPrice: entryPrice,
          stopLossPrice: stopLoss,

          totalRR: new Decimal(0), // Not realized
          totalNetProfit: unrealizedPnl.minus(fee).plus(funding), // Unrealized Net
          riskAmount: new Decimal(0),
          totalFees: fee.abs().plus(funding.abs()), // Total costs so far
          maxPotentialProfit: new Decimal(0),

          notes: `Open Position. Funding: ${funding.toFixed(
            4
          )}, Unrealized: ${unrealizedPnl.toFixed(4)}`,
          targets: [],
          calculatedTpDetails: [],

          fundingFee: funding,
          tradingFee: fee,
          realizedPnl: new Decimal(0), // It's unrealized
          isManual: false,
          positionSize: size,
        };
        newEntries.push(entry);
        addedCount++;
      }

      // --- Process History Positions (Closed) ---
      // We need a set of existing IDs from the *current* journal to avoid duplicates,
      // but we must not check against the "to-be-removed" open positions.
      const currentJournalForHistoryCheck = get(journalStore);
      const existingHistoryIds = new Set(
        currentJournalForHistoryCheck.map((j) => String(j.tradeId || j.id))
      );

      for (const p of historyPositions) {
        const uniqueId = String(p.positionId || `HIST-${p.symbol}-${p.ctime}`);
        if (existingHistoryIds.has(uniqueId)) continue;

        const realizedPnl = new Decimal(p.realizedPNL || 0);
        const funding = new Decimal(p.funding || 0);
        const fee = new Decimal(p.fee || 0);
        const entryPrice = new Decimal(p.entryPrice || 0);
        const closePrice = new Decimal(p.closePrice || 0);
        // P0 Fix: Ensure qty is not zero if maxQty is missing. Fallback to amount or qty.
        const qty = new Decimal(p.maxQty || p.qty || p.amount || 0);

        // Calculate Net PnL = Realized - Fees + Funding (Funding is usually negative if paid, so + (-cost))
        const netPnl = realizedPnl.plus(funding).minus(fee.abs());

        // Find SL
        let stopLoss = new Decimal(0);
        const posTime = parseTimestamp(p.ctime);

        const candidates = symbolSlMap[p.symbol];
        if (candidates && posTime > 0) {
          // Match by time: Order Ctime <= Position Ctime (Entry)
          // Position ctime is creation time.
          // Use tolerance
          const tolerance = 5000;
          for (let i = candidates.length - 1; i >= 0; i--) {
            // Find SL set around the time position was created
            // Look back window to avoid matching orders from weeks ago
            if (Math.abs(candidates[i].ctime - posTime) < 60000 * 60 * 24 * 7) {
              if (candidates[i].ctime <= posTime + tolerance) {
                stopLoss = candidates[i].slPrice;
                break;
              }
            }
          }
        }

        // R-Calc
        let riskAmount = new Decimal(0);
        let totalRR = new Decimal(0);
        if (stopLoss.gt(0) && entryPrice.gt(0) && qty.gt(0)) {
          const riskPerUnit = entryPrice.minus(stopLoss).abs();
          riskAmount = riskPerUnit.times(qty);
          if (riskAmount.gt(0) && !netPnl.isZero()) {
            totalRR = netPnl.div(riskAmount);
          }
        }

        // Parse close time (fallback to creation time)
        let closeTime = parseTimestamp(p.mtime || p.ctime);
        if (closeTime <= 0) closeTime = Date.now();

        // MAE/MFE Calculation
        let mae: Decimal | undefined;
        let mfe: Decimal | undefined;
        let efficiency: Decimal | undefined;

        try {
          // Only fetch if valid times and not super old (optimization optional)
          if (posTime > 0 && closeTime > posTime) {
            // Fetch klines for the duration
            const klines = await apiService.fetchBitunixKlines(
              p.symbol,
              "1m",
              1000,
              posTime,
              closeTime,
              "normal",
              30000
            );

            if (klines && klines.length > 0) {
              let maxHigh = new Decimal(0);
              let minLow = new Decimal(Infinity);

              klines.forEach((k) => {
                if (k.high.gt(maxHigh)) maxHigh = k.high;
                if (k.low.lt(minLow)) minLow = k.low;
              });

              const isShort =
                (p.side || "").toLowerCase().includes("sell") ||
                (p.side || "").toLowerCase().includes("short");

              if (minLow.isFinite() && maxHigh.gt(0)) {
                if (isShort) {
                  mae = maxHigh.minus(entryPrice);
                  mfe = entryPrice.minus(minLow);
                } else {
                  // Long
                  mae = entryPrice.minus(minLow);
                  mfe = maxHigh.minus(entryPrice);
                }

                // Efficiency: Realized PnL / (MFE * Size)
                // Only calc if MFE is positive (we had profit potential)
                if (mfe.gt(0) && qty.gt(0)) {
                  const maxPotential = mfe.times(qty);
                  efficiency = netPnl.div(maxPotential).times(100);
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to calc MAE/MFE for ${p.symbol}`, err);
        }

        const entry: JournalEntry = {
          id: Date.now() + Math.random(),
          tradeId: uniqueId,
          date: new Date(closeTime).toISOString(), // Close time
          entryDate: posTime > 0 ? new Date(posTime).toISOString() : undefined,
          symbol: p.symbol,
          tradeType: (p.side || "").toLowerCase().includes("sell")
            ? "short"
            : "long",
          status: netPnl.gt(0) ? "Won" : "Lost",

          accountSize: new Decimal(0),
          riskPercentage: new Decimal(0),
          leverage: new Decimal(p.leverage || 0),
          fees: new Decimal(0),

          entryPrice: entryPrice,
          exitPrice: closePrice,
          stopLossPrice: stopLoss,

          mae: mae,
          mfe: mfe,
          efficiency: efficiency,

          totalRR: totalRR,
          totalNetProfit: netPnl,
          riskAmount: riskAmount,
          totalFees: fee.abs().plus(funding.abs()),
          maxPotentialProfit: new Decimal(0),

          notes: `Synced Position. Funding: ${funding.toFixed(4)}`,
          targets: [],
          calculatedTpDetails: [],

          fundingFee: funding,
          tradingFee: fee,
          realizedPnl: realizedPnl,
          isManual: false,
          positionSize: qty,
        };
        newEntries.push(entry);
        addedCount++;
      }

      // --- SAFE SWAP ---
      // Now that we have `newEntries` (containing new Open and new History positions),
      // we perform the swap.

      // 1. Get current state
      const previousJournal = get(journalStore);

      // 2. Filter out OLD synced Open positions (because we have a fresh list of them in `newEntries`)
      //    We keep Manual trades and Closed Synced trades.
      const keptJournal = previousJournal.filter((j) => {
        const isSynced = j.isManual === false;
        const isOpen = j.status === "Open";
        // Remove if it is a Synced Open position
        return !(isSynced && isOpen);
      });

      // 3. Combine Kept + New
      const updatedJournal = [...keptJournal, ...newEntries];

      // 4. Sort
      updatedJournal.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // 5. Update Store & Save
      if (addedCount > 0 || updatedJournal.length !== previousJournal.length) {
        journalStore.set(updatedJournal);
        syncService.saveJournal(updatedJournal);

        if (isPartialSync) {
          uiStore.showError(
            "Sync unvollständig (Zeitüberschreitung). Bitte erneut versuchen, um ältere Daten zu laden."
          );
        } else {
          uiStore.showFeedback("save", 2000);
        }

        trackCustomEvent("Journal", "Sync", "Bitunix-Positions", addedCount);
      } else {
        if (isPartialSync) {
          uiStore.showError(
            "Sync unvollständig. Keine neuen Positionen, aber möglicherweise fehlen Daten."
          );
        } else {
          uiStore.showError("Keine neuen Positionen gefunden.");
        }
      }
    } catch (e: any) {
      console.error("Sync error:", e);
      uiStore.showError("Sync failed: " + e.message);
    } finally {
      uiStore.update((s) => ({ ...s, isPriceFetching: false }));
    }
  },

  saveJournal: (d: JournalEntry[]) => {
    if (!browser) return;
    try {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify(d)
      );
    } catch {
      uiStore.showError(
        "Fehler beim Speichern des Journals. Der lokale Speicher ist möglicherweise voll oder blockiert."
      );
    }
  },
};
