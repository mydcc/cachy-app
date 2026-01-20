/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { Decimal } from "decimal.js";

// Re-using types might require importing AppState or redefining what we need
// Ideally we import AppState, but let's define the shape here for clarity/independence or import if needed.
// For now, I will mirror the structure.

export interface TradeTarget {
    price: number | null;
    percent: number | null;
    isLocked: boolean;
}

const LOCAL_STORAGE_KEY = CONSTANTS.LOCAL_STORAGE_TRADE_KEY;

export const INITIAL_TRADE_STATE = {
    tradeType: CONSTANTS.TRADE_TYPE_LONG,
    accountSize: 1000,
    riskPercentage: 1,
    entryPrice: null as number | null,
    stopLossPrice: null as number | null,
    leverage: parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
    fees: parseFloat(CONSTANTS.DEFAULT_FEES),
    symbol: "",
    atrValue: null as number | null,
    atrMultiplier: parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
    useAtrSl: true,
    atrMode: "auto" as "auto" | "manual",
    atrTimeframe: "5m",
    analysisTimeframe: "1h",
    tradeNotes: "",
    tags: [] as string[],
    targets: [
        { price: null, percent: 50, isLocked: false },
        { price: null, percent: 25, isLocked: false },
        { price: null, percent: 25, isLocked: false },
    ] as TradeTarget[],
    isPositionSizeLocked: false,
    lockedPositionSize: null as Decimal | null,
    isRiskAmountLocked: false,
    riskAmount: null as number | null,
    journalSearchQuery: "",
    journalFilterStatus: "all",
    // Transient / Remote data placeholders
    currentTradeData: null as any,
    remoteLeverage: undefined as number | undefined,
    remoteMarginMode: undefined as string | undefined,
    remoteMakerFee: undefined as number | undefined,
    remoteTakerFee: undefined as number | undefined,
    feeMode: "maker_taker" as "maker_taker" | "flat",
    exitFees: undefined as number | undefined,
};

class TradeManager {
    tradeType = $state(INITIAL_TRADE_STATE.tradeType);
    accountSize = $state(INITIAL_TRADE_STATE.accountSize);
    riskPercentage = $state(INITIAL_TRADE_STATE.riskPercentage);
    entryPrice = $state(INITIAL_TRADE_STATE.entryPrice);
    stopLossPrice = $state(INITIAL_TRADE_STATE.stopLossPrice);
    leverage = $state(INITIAL_TRADE_STATE.leverage);
    fees = $state(INITIAL_TRADE_STATE.fees);
    symbol = $state(INITIAL_TRADE_STATE.symbol);
    atrValue = $state(INITIAL_TRADE_STATE.atrValue);
    atrMultiplier = $state(INITIAL_TRADE_STATE.atrMultiplier);
    useAtrSl = $state(INITIAL_TRADE_STATE.useAtrSl);
    atrMode = $state(INITIAL_TRADE_STATE.atrMode);
    atrTimeframe = $state(INITIAL_TRADE_STATE.atrTimeframe);
    analysisTimeframe = $state(INITIAL_TRADE_STATE.analysisTimeframe);
    tradeNotes = $state(INITIAL_TRADE_STATE.tradeNotes);
    tags = $state(INITIAL_TRADE_STATE.tags);
    targets = $state(INITIAL_TRADE_STATE.targets);
    isPositionSizeLocked = $state(INITIAL_TRADE_STATE.isPositionSizeLocked);
    lockedPositionSize = $state(INITIAL_TRADE_STATE.lockedPositionSize);
    isRiskAmountLocked = $state(INITIAL_TRADE_STATE.isRiskAmountLocked);
    riskAmount = $state(INITIAL_TRADE_STATE.riskAmount);
    journalSearchQuery = $state(INITIAL_TRADE_STATE.journalSearchQuery);
    journalFilterStatus = $state(INITIAL_TRADE_STATE.journalFilterStatus);

    // Transient
    currentTradeData = $state(INITIAL_TRADE_STATE.currentTradeData);
    remoteLeverage = $state(INITIAL_TRADE_STATE.remoteLeverage);
    remoteMarginMode = $state(INITIAL_TRADE_STATE.remoteMarginMode);
    remoteMakerFee = $state(INITIAL_TRADE_STATE.remoteMakerFee);
    remoteTakerFee = $state(INITIAL_TRADE_STATE.remoteTakerFee);
    feeMode = $state(INITIAL_TRADE_STATE.feeMode);
    exitFees = $state(INITIAL_TRADE_STATE.exitFees);

    constructor() {
        if (browser) {
            this.load();

            // Auto-save effect
            $effect.root(() => {
                $effect(() => {
                    this.save();
                });
            });
        }
    }

    private load() {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Bulk assign safe properties
                // We trust the keys from local storage but ensure defaults for missing ones
                const merged = { ...INITIAL_TRADE_STATE, ...parsed };

                // Assign each property specifically to trigger reactivity? 
                // Object.assign(this, merged) works for classes if properties are on instance.
                // With Runes, direct assignment to properties is best.

                this.tradeType = merged.tradeType;
                this.accountSize = merged.accountSize;
                this.riskPercentage = merged.riskPercentage;
                this.entryPrice = merged.entryPrice;
                this.stopLossPrice = merged.stopLossPrice;
                this.leverage = merged.leverage;
                this.fees = merged.fees;
                this.symbol = merged.symbol;
                this.atrValue = merged.atrValue;
                this.atrMultiplier = merged.atrMultiplier;
                this.useAtrSl = merged.useAtrSl;
                this.atrMode = merged.atrMode;
                this.atrTimeframe = merged.atrTimeframe;
                this.analysisTimeframe = merged.analysisTimeframe;
                this.tradeNotes = merged.tradeNotes;
                this.tags = merged.tags || [];

                // Fix targets issue
                if (!merged.targets || merged.targets.length === 0) {
                    this.targets = JSON.parse(JSON.stringify(INITIAL_TRADE_STATE.targets));
                } else {
                    this.targets = merged.targets;
                }

                this.isPositionSizeLocked = merged.isPositionSizeLocked;
                // lockedPositionSize is Decimal usually, but JSON makes it string/object.
                // If it's stored as plain value, need to handle reconstruction if used as Decimal?
                // In tradeStore.ts it says: "currentTradeData contains Decimal objects... but we re-calculate on load anyway."
                // lockedPositionSize might be Decimal. Let's check usages. 
                // Usually it's safer to store as string/number in JSON and revive.
                // For now, let's assume standard behavior.
                if (merged.lockedPositionSize) {
                    this.lockedPositionSize = new Decimal(merged.lockedPositionSize);
                } else {
                    this.lockedPositionSize = null;
                }

                this.isRiskAmountLocked = merged.isRiskAmountLocked;
                this.riskAmount = merged.riskAmount;
                this.journalSearchQuery = merged.journalSearchQuery;
                this.journalFilterStatus = merged.journalFilterStatus;
            }
        } catch (e) {
            console.error("Failed to load trade state", e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            // Snapshot
            const s = this.getSnapshot();
            // Exclude transient
            const toSave = { ...s };
            delete toSave.currentTradeData;

            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
            this.notifyListeners();
        } catch (e) {
            console.error("Failed to save trade state", e);
        }
    }

    setSymbol(symbol: string, provider: "bitunix" | "binance" = "bitunix"): boolean {
        if (!symbol) {
            this.symbol = "";
            return true;
        }
        const normalized = normalizeSymbol(symbol, provider);
        if (!normalized) {
            console.warn("[tradeState] Invalid symbol:", symbol);
            return false;
        }
        this.symbol = normalized;
        return true;
    }

    toggleAtrInputs(enable: boolean) {
        this.useAtrSl = enable;
        if (enable) {
            this.atrMode = "auto";
        }
    }

    // resetAllInputs needs access to resultsState and uiState generally to coordinate.
    // We can define a Reset method here that ONLY resets trade state, 
    // and let the Service orchestrate the rest. 
    // However, to replace `resetAllInputs` from tradeStore, we need to return to defaults.

    resetInputs(preserveSymbol = true) {
        const currentSymbol = this.symbol;

        // Reset fields
        this.tradeType = INITIAL_TRADE_STATE.tradeType;
        // Keep account settings? Usually reset keeps account size/risk?
        // tradeStore.ts uses JSON.parse(initialTradeState), so it resets EVERYTHING except symbol.
        this.accountSize = INITIAL_TRADE_STATE.accountSize;
        this.riskPercentage = INITIAL_TRADE_STATE.riskPercentage;
        this.entryPrice = null;
        this.stopLossPrice = null;
        this.leverage = INITIAL_TRADE_STATE.leverage;
        this.fees = INITIAL_TRADE_STATE.fees;
        this.atrValue = null;
        this.atrMultiplier = INITIAL_TRADE_STATE.atrMultiplier;
        this.useAtrSl = false; // "User requested Auto-ATR off" logic from tradeStore
        this.atrMode = INITIAL_TRADE_STATE.atrMode;
        this.atrTimeframe = INITIAL_TRADE_STATE.atrTimeframe;
        this.tradeNotes = "";
        this.tags = [];
        this.targets = JSON.parse(JSON.stringify(INITIAL_TRADE_STATE.targets));
        this.isPositionSizeLocked = false;
        this.lockedPositionSize = null;
        this.isRiskAmountLocked = false;
        this.riskAmount = null;

        if (preserveSymbol) {
            this.symbol = currentSymbol;
        } else {
            this.symbol = "";
        }
    }

    // Helper for legacy 'update' pattern
    update(fn: (curr: any) => any) {
        // Create a snapshot object
        const snap = this.getSnapshot();
        const next = fn(snap);

        // Apply back
        Object.assign(this, next);

        // Handle nested Decimal if replaced? (lockedPositionSize)
        if (next.lockedPositionSize && !(next.lockedPositionSize instanceof Decimal)) {
            this.lockedPositionSize = new Decimal(next.lockedPositionSize);
        }
    }

    // Helper for legacy 'set' pattern (useful for tests)
    set(newState: any) {
        Object.assign(this, newState);
        if (newState.lockedPositionSize && !(newState.lockedPositionSize instanceof Decimal)) {
            try {
                this.lockedPositionSize = new Decimal(newState.lockedPositionSize);
            } catch (e) { /* ignore */ }
        }
    }

    getSnapshot() {
        return {
            tradeType: this.tradeType,
            accountSize: this.accountSize,
            riskPercentage: this.riskPercentage,
            entryPrice: this.entryPrice,
            stopLossPrice: this.stopLossPrice,
            leverage: this.leverage,
            fees: this.fees,
            symbol: this.symbol,
            atrValue: this.atrValue,
            atrMultiplier: this.atrMultiplier,
            useAtrSl: this.useAtrSl,
            atrMode: this.atrMode,
            atrTimeframe: this.atrTimeframe,
            analysisTimeframe: this.analysisTimeframe,
            tradeNotes: this.tradeNotes,
            tags: this.tags,
            targets: this.targets,
            isPositionSizeLocked: this.isPositionSizeLocked,
            lockedPositionSize: this.lockedPositionSize,
            isRiskAmountLocked: this.isRiskAmountLocked,
            riskAmount: this.riskAmount,
            journalSearchQuery: this.journalSearchQuery,
            journalFilterStatus: this.journalFilterStatus,
            currentTradeData: this.currentTradeData,
            remoteLeverage: this.remoteLeverage,
            remoteMarginMode: this.remoteMarginMode,
            remoteMakerFee: this.remoteMakerFee,
            remoteTakerFee: this.remoteTakerFee,
            feeMode: this.feeMode,
            exitFees: this.exitFees,
        };
    }

    // Compatibility
    private listeners = new Set<(value: any) => void>();
    // private notifyTimer: any = null; // Removed debounce for sync updates

    private notifyListeners() {
        // Synchronous notification to prevent race conditions
        const snap = this.getSnapshot();
        this.listeners.forEach(fn => fn(snap));
    }

    subscribe(fn: (value: any) => void): () => void {
        fn(this.getSnapshot());
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }
}


export const tradeState = new TradeManager();
