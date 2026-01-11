import { get } from 'svelte/store';
import { parseTimestamp } from '../utils/utils';
import { CONSTANTS } from '../lib/constants';
import { journalStore } from '../stores/journalStore';
import { uiStore } from '../stores/uiStore';
import { settingsStore } from '../stores/settingsStore';
import { apiService } from './apiService'; // Import apiService
import type { JournalEntry } from '../stores/types';
import { Decimal } from 'decimal.js';
import { trackCustomEvent } from './trackingService';
import { browser } from '$app/environment';

export const syncService = {
    syncBitunixPositions: async () => {
        const settings = get(settingsStore);
        if (!settings.isPro) return;
        if (!settings.apiKeys.bitunix.key || !settings.apiKeys.bitunix.secret) {
            uiStore.showError('settings.apiKeysRequired');
            return;
        }

        uiStore.update(s => ({ ...s, isPriceFetching: true }));

        try {
            // 1. Fetch History Positions (The Truth about closed trades)
            const historyResponse = await fetch('/api/sync/positions-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: settings.apiKeys.bitunix.key,
                    apiSecret: settings.apiKeys.bitunix.secret,
                    limit: 100
                })
            });
            const historyResult = await historyResponse.json();
            if (historyResult.error) throw new Error(historyResult.error);
            const historyPositions = historyResult.data;

            // 2. Fetch Pending Positions (Open Trades)
            const pendingResponse = await fetch('/api/sync/positions-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: settings.apiKeys.bitunix.key,
                    apiSecret: settings.apiKeys.bitunix.secret
                })
            });
            const pendingResult = await pendingResponse.json();
            // Pending positions might fail if empty, but we check array
            const pendingPositions = Array.isArray(pendingResult.data) ? pendingResult.data : [];


            // 3. Fetch Orders (Still needed to find initial Stop Loss for R-Calc, and now Role/OrderType)
            const orderResponse = await fetch('/api/sync/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: settings.apiKeys.bitunix.key,
                    apiSecret: settings.apiKeys.bitunix.secret,
                    limit: 100
                })
            });

            let orders: any[] = [];
            try {
                const orderResult = await orderResponse.json();
                if (orderResult.isPartial) {
                    uiStore.showError('sync.partialDataWarning');
                }
                if (!orderResult.error && Array.isArray(orderResult.data)) {
                    orders = orderResult.data;
                }
            } catch (err) {
                console.warn("Failed to fetch orders:", err);
            }

            // --- Pre-process orders to create lookups ---
            // Symbol -> Orders lookup for SL and Role/Type matching
            const symbolOrdersMap: Record<string, any[]> = {};

            orders.forEach((o: any) => {
                if (o.symbol) {
                    if (!symbolOrdersMap[o.symbol]) symbolOrdersMap[o.symbol] = [];
                    symbolOrdersMap[o.symbol].push(o);
                }
            });
            // Sort orders by creation time ascending
            Object.values(symbolOrdersMap).forEach(list => list.sort((a, b) => (a.createTime || a.ctime) - (b.createTime || b.ctime)));
            // ------------------------------------------------------------------

            // Cleanup logic prepared, but we execute it ONLY after we successfully processed the new data
            // to prevent data loss in case of logic errors during processing.
            const newEntries: JournalEntry[] = [];
            let addedCount = 0;

            // --- Process Pending Positions (Open) ---
            const processedPendingIds = new Set<string>();

            for (const p of pendingPositions) {
                // Unique ID for pending: "OPEN-{positionId}" or "OPEN-{symbol}" if no ID
                const uniqueId = `OPEN-${p.positionId || p.symbol}`;
                processedPendingIds.add(uniqueId);

                const entryPrice = new Decimal(p.avgOpenPrice || p.entryPrice || 0);
                const unrealizedPnl = new Decimal(p.unrealizedPNL || 0);
                const funding = new Decimal(p.funding || 0);
                const fee = new Decimal(p.fee || 0);
                const size = new Decimal(p.qty || p.size || 0);
                const leverage = new Decimal(p.leverage || 0);

                // Find SL for Open Position (Look for recent orders)
                let stopLoss = new Decimal(0);
                const candidates = symbolOrdersMap[p.symbol];
                if (candidates && candidates.length > 0) {
                     // Get latest SL from orders
                     // Filter for SL orders if possible
                     const slOrders = candidates.filter(o => o.slPrice || o.stopLossPrice || o.triggerPrice);
                     if (slOrders.length > 0) {
                         const lastSlOrder = slOrders[slOrders.length - 1];
                         stopLoss = new Decimal(lastSlOrder.slPrice || lastSlOrder.stopLossPrice || lastSlOrder.triggerPrice || 0);
                     }
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
                    tradeType: (p.side || '').toLowerCase().includes('sell') || (p.side || '').toLowerCase().includes('short') ? 'short' : 'long',
                    status: 'Open',

                    accountSize: new Decimal(0),
                    riskPercentage: new Decimal(0),
                    leverage: leverage,
                    fees: new Decimal(0), // Estimated % not known, using absolute below

                    entryPrice: entryPrice,
                    stopLossPrice: stopLoss,

                    totalRR: new Decimal(0), // Not realized
                    totalNetProfit: unrealizedPnl.minus(fee).plus(funding), // Unrealized Net
                    riskAmount: new Decimal(0),
                    totalFees: fee.abs().plus(funding.abs()), // Total costs so far
                    maxPotentialProfit: new Decimal(0),

                    notes: `Open Position. Funding: ${funding.toFixed(4)}, Unrealized: ${unrealizedPnl.toFixed(4)}`,
                    targets: [],
                    calculatedTpDetails: [],

                    fundingFee: funding,
                    tradingFee: fee,
                    realizedPnl: new Decimal(0), // It's unrealized
                    isManual: false,

                    // New Fields
                    positionSize: size,
                    marginMode: p.marginMode || 'cross',
                    orderType: 'Unknown', // Hard to determine for open pos without polling pending orders
                    role: 'N/A'
                };
                newEntries.push(entry);
                addedCount++;
            }

            // --- Process History Positions (Closed) ---
            // We need a set of existing IDs from the *current* journal to avoid duplicates,
            // but we must not check against the "to-be-removed" open positions.
            const currentJournalForHistoryCheck = get(journalStore);
            const existingHistoryIds = new Set(currentJournalForHistoryCheck.map(j => String(j.tradeId || j.id)));

            for (const p of historyPositions) {
                const uniqueId = String(p.positionId || `HIST-${p.symbol}-${p.ctime}`);
                if (existingHistoryIds.has(uniqueId)) continue;

                const realizedPnl = new Decimal(p.realizedPNL || 0);
                const funding = new Decimal(p.funding || 0);
                const fee = new Decimal(p.fee || 0);
                const entryPrice = new Decimal(p.entryPrice || 0);
                const closePrice = new Decimal(p.closePrice || 0);
                const qty = new Decimal(p.maxQty || 0); // Approx size

                // Calculate Net PnL = Realized - Fees + Funding (Funding is usually negative if paid, so + (-cost))
                const netPnl = realizedPnl.plus(funding).minus(fee.abs());

                const posTime = parseTimestamp(p.ctime);
                // Parse close time (fallback to creation time)
                let closeTime = parseTimestamp(p.mtime || p.ctime);
                if (closeTime <= 0) closeTime = Date.now();

                // Find SL and Order Info
                let stopLoss = new Decimal(0);
                let orderType = 'Unknown';
                let role = 'Taker'; // Default assumption if unknown, safer for fee estimation

                const candidates = symbolOrdersMap[p.symbol];
                if (candidates && posTime > 0) {
                    const tolerance = 5000;

                    // 1. Find Opening Order (approx same ctime)
                    const openingOrder = candidates.find(o => Math.abs((o.createTime || o.ctime) - posTime) < tolerance);

                    if (openingOrder) {
                        // Extract Type
                        if (openingOrder.type) {
                             // Bitunix often uses numeric types: 1=Limit, 2=Market
                             const t = Number(openingOrder.type);
                             if (t === 1) orderType = 'Limit';
                             else if (t === 2) orderType = 'Market';
                             else if (t === 3) orderType = 'Stop Limit';
                             else if (t === 4) orderType = 'Stop Market';
                             else orderType = String(openingOrder.type);
                        }

                        // Extract Role (Maker/Taker) - if available.
                        // Bitunix might not return 'role' in get_history_orders explicitly in all endpoints.
                        // Sometimes it's in trade history (fills). We only have orders here.
                        // We can guess: Limit orders *usually* act as Maker if not IOC/FOK and not immediately filled.
                        // But strictly speaking, a Limit order can be Taker.
                        // If we don't have explicit role, we leave it 'Unknown' or assume based on type.
                        if (openingOrder.role) role = openingOrder.role;
                        else if (orderType === 'Market') role = 'Taker';
                        // If Limit, we don't know for sure.
                    }

                    // 2. Find SL
                    for (let i = candidates.length - 1; i >= 0; i--) {
                        if (Math.abs(candidates[i].ctime - posTime) < 60000 * 60 * 24 * 7) {
                             // Check for SL price presence
                             const sl = candidates[i].slPrice || candidates[i].stopLossPrice || candidates[i].triggerPrice;
                             if (candidates[i].ctime <= posTime + tolerance && sl) {
                                 stopLoss = new Decimal(sl);
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

                // --- Advanced Metrics (MAE/MFE) ---
                let mae: Decimal | undefined;
                let mfe: Decimal | undefined;
                let efficiency: Decimal | undefined;
                const duration = closeTime - posTime;

                // Helper to check if trade was LONG or SHORT
                const isLong = (p.side || '').toLowerCase().includes('long') || (p.side || '').toLowerCase().includes('buy');

                if (settings.enableAdvancedMetrics && duration > 0) {
                    try {
                        // Fetch 1m klines for the duration
                        // Bitunix limits: 1000 candles. If duration > 1000m (~16h), we might miss data if we only fetch 1000.
                        // Strategy: Calculate required limit.
                        const minutes = Math.ceil(duration / 60000);
                        let interval = '1m';
                        let limit = minutes + 20; // Buffer

                        if (limit > 1000) {
                            // If too long, switch resolution to fit in one request (simplified for MVP)
                            if (limit / 60 <= 1000) {
                                interval = '1h';
                                limit = Math.ceil(limit / 60) + 5;
                            } else {
                                interval = '1d';
                                limit = Math.ceil(limit / (60 * 24)) + 5;
                            }
                        }

                        // Pass startTime and endTime (in milliseconds)
                        // Buffer start/end slightly to capture full candles
                        const klines = await apiService.fetchBitunixKlines(p.symbol, interval, limit, posTime - 60000, closeTime + 60000);

                        if (klines && klines.length > 0) {
                            let maxHigh = new Decimal(0);
                            let minLow = new Decimal(Infinity);

                            for (const k of klines) {
                                if (k.high.gt(maxHigh)) maxHigh = k.high;
                                if (k.low.lt(minLow)) minLow = k.low;
                            }

                            // Prevent Infinity
                            if (minLow.equals(new Decimal(Infinity))) minLow = entryPrice;
                            if (maxHigh.equals(new Decimal(0))) maxHigh = entryPrice;

                            // Calculate Metrics based on direction
                            if (isLong) {
                                // Long: Bad = Low < Entry, Good = High > Entry
                                // MAE (Adverse): How much did it drop below entry? (as negative %)
                                // MinLow - Entry. If MinLow < Entry, result negative.
                                // Normalized by Entry.
                                const maeVal = minLow.minus(entryPrice).div(entryPrice).times(100);
                                mae = maeVal.lt(0) ? maeVal : new Decimal(0); // Only capture adverse

                                // MFE (Favorable): How much did it rise above entry? (as positive %)
                                const mfeVal = maxHigh.minus(entryPrice).div(entryPrice).times(100);
                                mfe = mfeVal.gt(0) ? mfeVal : new Decimal(0);

                                // Efficiency: (Exit - Entry) / (High - Low) or (Exit - Entry) / (MaxHigh - Entry)?
                                // Standard Efficiency usually (Close - Open) / (High - Low) of the trade range.
                                // Capture Ratio
                                const range = maxHigh.minus(minLow);
                                if (!range.isZero()) {
                                    efficiency = closePrice.minus(entryPrice).div(range).times(100);
                                }
                            } else {
                                // Short: Bad = High > Entry, Good = Low < Entry
                                // MAE (Adverse): How much did it rise above entry? (as negative %)
                                // Entry - MaxHigh. Result negative.
                                const maeVal = entryPrice.minus(maxHigh).div(entryPrice).times(100);
                                mae = maeVal.lt(0) ? maeVal : new Decimal(0);

                                // MFE (Favorable): How much did it drop below entry? (as positive %)
                                const mfeVal = entryPrice.minus(minLow).div(entryPrice).times(100);
                                mfe = mfeVal.gt(0) ? mfeVal : new Decimal(0);

                                // Efficiency
                                const range = maxHigh.minus(minLow);
                                if (!range.isZero()) {
                                    efficiency = entryPrice.minus(closePrice).div(range).times(100);
                                }
                            }
                        }

                    } catch (err) {
                        console.warn("MAE/MFE calculation failed:", err);
                    }
                }

                const entry: JournalEntry = {
                    id: Date.now() + Math.random(),
                    tradeId: uniqueId,
                    date: new Date(closeTime).toISOString(), // Close time
                    entryDate: posTime > 0 ? new Date(posTime).toISOString() : undefined,
                    exitDate: new Date(closeTime).toISOString(),
                    symbol: p.symbol,
                    tradeType: (p.side || '').toLowerCase().includes('sell') ? 'short' : 'long',
                    status: netPnl.gt(0) ? 'Won' : 'Lost',

                    accountSize: new Decimal(0),
                    riskPercentage: new Decimal(0),
                    leverage: new Decimal(p.leverage || 0),
                    fees: new Decimal(0),

                    entryPrice: entryPrice,
                    exitPrice: closePrice,
                    stopLossPrice: stopLoss,

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

                    // New Fields
                    positionSize: qty,
                    marginMode: p.marginMode || 'cross',
                    orderType: orderType,
                    role: role,
                    duration: duration,
                    mae: mae,
                    mfe: mfe,
                    efficiency: efficiency
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
            const keptJournal = previousJournal.filter(j => {
                const isSynced = j.isManual === false;
                const isOpen = j.status === 'Open';
                // Remove if it is a Synced Open position
                return !(isSynced && isOpen);
            });

            // 3. Combine Kept + New
            const updatedJournal = [...keptJournal, ...newEntries];

            // 4. Sort
            updatedJournal.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // 5. Update Store & Save
            if (addedCount > 0 || updatedJournal.length !== previousJournal.length) {
                journalStore.set(updatedJournal);
                syncService.saveJournal(updatedJournal);
                uiStore.showFeedback('save', 2000);
                trackCustomEvent('Journal', 'Sync', 'Bitunix-Positions', addedCount);
            } else {
                 uiStore.showError("Keine neuen Positionen gefunden.");
            }

        } catch (e: any) {
            console.error("Sync error:", e);
            uiStore.showError("Sync failed: " + e.message);
        } finally {
            uiStore.update(s => ({ ...s, isPriceFetching: false }));
        }
    },

    saveJournal: (d: JournalEntry[]) => {
        if (!browser) return;
        try {
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, JSON.stringify(d));
        } catch {
            uiStore.showError("Fehler beim Speichern des Journals. Der lokale Speicher ist möglicherweise voll oder blockiert.");
        }
    }
};
