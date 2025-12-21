import { writable } from 'svelte/store';
import { CONSTANTS } from '../lib/constants';
import type { AppState } from './types';
import { resultsStore, initialResultsState } from './resultsStore';
import { uiStore } from './uiStore';
import { browser } from '$app/environment';

export const initialTradeState: Pick<AppState,
    'tradeType' |
    'accountSize' |
    'riskPercentage' |
    'entryPrice' |
    'stopLossPrice' |
    'leverage' |
    'fees' |
    'symbol' |
    'atrValue' |
    'atrMultiplier' |
    'useAtrSl' |
    'atrMode' |
    'atrTimeframe' |
    'tradeNotes' |
    'targets' |
    'isPositionSizeLocked' |
    'lockedPositionSize' |
    'isRiskAmountLocked' |
    'riskAmount' |
    'journalSearchQuery' |
    'journalFilterStatus' |
    'currentTradeData'
> = {
    tradeType: CONSTANTS.TRADE_TYPE_LONG,
    accountSize: 1000,
    riskPercentage: 1,
    entryPrice: null,
    stopLossPrice: null,
    leverage: parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
    fees: parseFloat(CONSTANTS.DEFAULT_FEES),
    symbol: '',
    atrValue: null,
    atrMultiplier: parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
    useAtrSl: false,
    atrMode: 'manual',
    atrTimeframe: '1d',
    tradeNotes: '',
    targets: [
        { price: null, percent: 50, isLocked: false },
        { price: null, percent: 25, isLocked: false },
        { price: null, percent: 25, isLocked: false }
    ],
    isPositionSizeLocked: false,
    lockedPositionSize: null,
    isRiskAmountLocked: false,
    riskAmount: null,
    journalSearchQuery: '',
    journalFilterStatus: 'all',
    currentTradeData: null,
};

function loadTradeStateFromLocalStorage(): typeof initialTradeState {
    if (!browser) return initialTradeState;
    try {
        const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_TRADE_KEY);
        if (!d) return initialTradeState;
        const parsed = JSON.parse(d);
        
        // Merge with initial state to ensure all keys exist
        // We override initial defaults with parsed data
        // Note: transient data like 'currentTradeData' might be good to ignore or reset if it depends on fresh calculation.
        // However, user said "exactly where left off".
        // But 'currentTradeData' is typically derived from api/calculation, if we save it, we might show stale data.
        // But if inputs are saved, the UI might re-trigger calculation or show inputs.
        // We'll trust the merge. But let's verify if we should exclude some.
        // For now, let's load everything that matches the keys.
        
        return {
            ...initialTradeState,
            ...parsed,
            // Ensure we don't accidentally load invalid types if needed, but simple merge is usually fine for these primitives
        };
    } catch (e) {
        console.warn("Could not load trade state from localStorage", e);
        return initialTradeState;
    }
}

export const tradeStore = writable(loadTradeStateFromLocalStorage());

tradeStore.subscribe(value => {
    if (browser) {
        try {
            // We save everything.
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_TRADE_KEY, JSON.stringify(value));
        } catch (e) {
            console.warn("Could not save trade state to localStorage", e);
        }
    }
});

// Helper function to update parts of the store
export const updateTradeStore = (updater: (state: typeof initialTradeState) => typeof initialTradeState) => {
    tradeStore.update(updater);
};

// Helper function to toggle ATR inputs visibility
export const toggleAtrInputs = (useAtrSl: boolean) => {
    updateTradeStore(state => ({
        ...state,
        useAtrSl: useAtrSl,
        atrMode: useAtrSl ? 'auto' : state.atrMode,
    }));
};

// Helper function to reset all inputs
export const resetAllInputs = () => {
    tradeStore.set(initialTradeState);
    resultsStore.set(initialResultsState);
    uiStore.showError('dashboard.promptForData');
    // Also clear from local storage if 'reset' implies clearing persistence?
    // User said "reset back to standard", usually implies clearing.
    // The subscribe block will handle saving the 'initialTradeState' to localStorage automatically.
};
