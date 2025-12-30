import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { Decimal } from 'decimal.js';
import { CONSTANTS } from '../lib/constants';
import type { JournalEntry } from './types';

function loadJournalFromLocalStorage(): JournalEntry[] {
    if (!browser) return [];
    try {
        const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || '[]';
        const parsedData = JSON.parse(d);
        if (!Array.isArray(parsedData)) return [];
        return parsedData.map(trade => {
            const newTrade = { ...trade };
            Object.keys(newTrade).forEach(key => {
                if (['accountSize', 'riskPercentage', 'entryPrice', 'stopLossPrice', 'leverage', 'fees', 'atrValue', 'atrMultiplier', 'totalRR', 'totalNetProfit', 'netLoss', 'riskAmount', 'totalFees', 'maxPotentialProfit', 'positionSize', 'fundingFee', 'tradingFee', 'realizedPnl'].includes(key)) {
                    newTrade[key] = new Decimal(newTrade[key] || 0);
                }
            });
            // Ensure defaults for new fields if missing (migration)
            if (newTrade.isManual === undefined) newTrade.isManual = true; // Assume existing are manual
            if (!newTrade.fundingFee) newTrade.fundingFee = new Decimal(0);
            if (!newTrade.tradingFee) newTrade.tradingFee = new Decimal(0);
            if (!newTrade.realizedPnl) newTrade.realizedPnl = new Decimal(0);
            if (newTrade.targets && Array.isArray(newTrade.targets)) {
                newTrade.targets = newTrade.targets.map((tp: {price: string | number; percent: string | number}) => ({ ...tp, price: new Decimal(tp.price || 0), percent: new Decimal(tp.percent || 0) }));
            }
            return newTrade as JournalEntry;
        });
    } catch (e) {
        console.warn("Could not load journal from localStorage.", e);
        // showError("Journal konnte nicht geladen werden."); // This would cause dependency cycle
        return [];
    }
}

export const journalStore = writable<JournalEntry[]>(loadJournalFromLocalStorage());

journalStore.subscribe(value => {
    if (browser) {
        try {
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, JSON.stringify(value));
        } catch (e) {
            console.warn("Could not save journal to localStorage.", e);
        }
    }
});
