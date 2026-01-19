import { journalState } from "../stores/journal.svelte";
import { apiService } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";

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
     * Iterates through all trades needing repair and attempts to fetch historical data
     * to calculate the ATR. Updates the journalState directly.
     * 
     * @param onProgress Callback (current, total, message)
     */
    async repairMissingAtr(
        onProgress: (current: number, total: number, message: string) => void
    ) {
        const allTrades = journalState.entries;
        // Filter consistent with scan logic
        const targets = allTrades.filter(
            (t) => (t.status === "Won" || t.status === "Lost") && !t.atrValue
        );

        const total = targets.length;
        if (total === 0) {
            onProgress(0, 0, "Keine Trades zum Reparieren gefunden.");
            return;
        }

        let processed = 0;

        for (const trade of targets) {
            processed++;
            onProgress(processed, total, `Repariere ${trade.symbol} (${trade.date})...`);

            try {
                // 1. Determine Timestamp
                // Use entryDate if available, otherwise just date
                const timeStr = trade.entryDate || trade.date;
                const timestamp = new Date(timeStr).getTime();

                if (isNaN(timestamp)) {
                    console.warn(`[DataRepair] Invalid date for trade ${trade.id}, skipping.`);
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
                    25,        // limit
                    undefined, // startTime
                    timestamp, // endTime
                    "normal"   // priority
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
                            atrValue: atr
                        });

                        console.log(`[DataRepair] Updated ATR for ${trade.symbol}: ${atr.toString()}`);
                    }
                }

            } catch (e) {
                console.error(`[DataRepair] Failed to repair ${trade.symbol}:`, e);
                // Continue with next trade
            }

            // 5. Rate Limit / Pacing
            // Wait 500ms between requests to be gentle 
            // (RequestManager handles concurrency, but this sequential loop adds extra safety)
            await new Promise(r => setTimeout(r, 500));
        }

        onProgress(total, total, "Reparatur abgeschlossen.");
    }
};
