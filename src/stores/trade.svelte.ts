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

import { browser } from "$app/environment";
import { untrack } from "svelte";
import { CONSTANTS } from "../lib/constants";
import { normalizeSymbol } from "../utils/symbolUtils";
import { debounce } from "../utils/utils";
import { Decimal } from "decimal.js";
import { safeJsonParse } from "../utils/safeJson";
import { z } from "zod";

// Re-using types might require importing AppState or redefining what we need
// Ideally we import AppState, but let's define the shape here for clarity/independence or import if needed.
// For now, I will mirror the structure.

export interface TradeTarget {
  price: string | null;
  percent: string | null;
  isLocked: boolean;
}

export interface TradeStateSnapshot {
  tradeType: string;
  accountSize: string;
  riskPercentage: string;
  entryPrice: string | null;
  stopLossPrice: string | null;
  leverage: string | null;
  fees: string | null;
  symbol: string;
  atrValue: string | null;
  atrMultiplier: number;
  useAtrSl: boolean;
  atrMode: "auto" | "manual";
  atrTimeframe: string;
  analysisTimeframe: string;
  tradeNotes: string;
  tags: string[];
  targets: TradeTarget[];
  isPositionSizeLocked: boolean;
  lockedPositionSize: Decimal | null;
  isRiskAmountLocked: boolean;
  riskAmount: string | null;
  journalSearchQuery: string;
  journalFilterStatus: string;
  currentTradeData: Record<string, any> | null;
  remoteLeverage: Decimal | undefined;
  remoteMarginMode: string | undefined;
  remoteMakerFee: Decimal | undefined;
  remoteTakerFee: Decimal | undefined;
  feeMode: "maker_taker" | "flat";
  exitFees: Decimal | undefined;
}

const LOCAL_STORAGE_KEY = CONSTANTS.LOCAL_STORAGE_TRADE_KEY;

// Define Zod Schema for TradeTarget
const TradeTargetSchema = z.object({
  price: z.union([z.string(), z.number()]).transform(v => v === null ? null : String(v)).nullable(),
  percent: z.union([z.string(), z.number()]).transform(v => v === null ? null : String(v)).nullable(),
  isLocked: z.boolean(),
});

// Helper to transform number/string to string safely, ensuring strict numeric format
const stringSchema = z.union([
  z.string().regex(/^\d*\.?\d*$/, "Must be a valid number"),
  z.number()
]).transform(val => {
  if (val === null || val === undefined) return null;
  return String(val);
}).nullable();

// Required string schema (not nullable) for accountSize/riskPercentage which have defaults
const requiredStringSchema = z.union([
  z.string(),
  z.number()
]).transform(val => String(val));

// Define Zod Schema for TradeState
const TradeStateSchema = z.object({
  tradeType: z.string(),
  accountSize: requiredStringSchema,
  riskPercentage: requiredStringSchema,
  entryPrice: stringSchema,
  stopLossPrice: stringSchema,
  leverage: stringSchema,
  fees: stringSchema,
  symbol: z.string(),
  atrValue: stringSchema,
  atrMultiplier: z.number(), // Multiplier is usually simple float (1.5)
  useAtrSl: z.boolean(),
  atrMode: z.enum(["auto", "manual"]).catch("auto"),
  atrTimeframe: z.string(),
  analysisTimeframe: z.string().optional().default("1h"),
  tradeNotes: z.string(),
  tags: z.array(z.string()).optional().default([]),
  targets: z.array(TradeTargetSchema).optional(),
  isPositionSizeLocked: z.boolean(),
  lockedPositionSize: z.union([z.string(), z.number(), z.null()]).transform(val => {
    if (val === null) return null;
    return new Decimal(val);
  }).nullable(),
  isRiskAmountLocked: z.boolean(),
  riskAmount: stringSchema,
  journalSearchQuery: z.string().optional().default(""),
  journalFilterStatus: z.string().optional().default("all"),
});

export const INITIAL_TRADE_STATE = {
  tradeType: CONSTANTS.TRADE_TYPE_LONG,
  accountSize: "1000",
  riskPercentage: "1",
  entryPrice: null as string | null,
  stopLossPrice: null as string | null,
  leverage: CONSTANTS.DEFAULT_LEVERAGE, // String in constants?
  fees: CONSTANTS.DEFAULT_FEES,
  symbol: "BTCUSDT",
  atrValue: null as string | null,
  atrMultiplier: 1.2,
  useAtrSl: true,
  atrMode: "auto" as "auto" | "manual",
  atrTimeframe: "5m",
  analysisTimeframe: "1h",
  tradeNotes: "",
  tags: [] as string[],
  targets: [] as TradeTarget[],
  isPositionSizeLocked: false,
  lockedPositionSize: null as Decimal | null,
  isRiskAmountLocked: false,
  riskAmount: null as string | null,
  journalSearchQuery: "",
  journalFilterStatus: "all",
  // Transient / Remote data placeholders
  currentTradeData: null as any,
  remoteLeverage: undefined as Decimal | undefined,
  remoteMarginMode: undefined as string | undefined,
  remoteMakerFee: undefined as Decimal | undefined,
  remoteTakerFee: undefined as Decimal | undefined,
  feeMode: "maker_taker" as "maker_taker" | "flat",
  exitFees: undefined as Decimal | undefined,
};

class TradeManager {
  tradeType = $state<string>(INITIAL_TRADE_STATE.tradeType);
  accountSize = $state<string>(INITIAL_TRADE_STATE.accountSize);
  riskPercentage = $state<string>(INITIAL_TRADE_STATE.riskPercentage);
  entryPrice = $state<string | null>(INITIAL_TRADE_STATE.entryPrice);
  stopLossPrice = $state<string | null>(INITIAL_TRADE_STATE.stopLossPrice);
  leverage = $state<string | null>(INITIAL_TRADE_STATE.leverage);
  fees = $state<string | null>(INITIAL_TRADE_STATE.fees);
  symbol = $state<string>(INITIAL_TRADE_STATE.symbol);
  atrValue = $state<string | null>(INITIAL_TRADE_STATE.atrValue);
  atrMultiplier = $state<number>(INITIAL_TRADE_STATE.atrMultiplier);
  useAtrSl = $state<boolean>(INITIAL_TRADE_STATE.useAtrSl);
  atrMode = $state<"auto" | "manual">(INITIAL_TRADE_STATE.atrMode);
  atrTimeframe = $state<string>(INITIAL_TRADE_STATE.atrTimeframe);
  analysisTimeframe = $state<string>(INITIAL_TRADE_STATE.analysisTimeframe);
  tradeNotes = $state<string>(INITIAL_TRADE_STATE.tradeNotes);
  tags = $state<string[]>(INITIAL_TRADE_STATE.tags);
  targets = $state<TradeTarget[]>(INITIAL_TRADE_STATE.targets);
  isPositionSizeLocked = $state<boolean>(INITIAL_TRADE_STATE.isPositionSizeLocked);
  lockedPositionSize = $state<Decimal | null>(INITIAL_TRADE_STATE.lockedPositionSize);
  isRiskAmountLocked = $state<boolean>(INITIAL_TRADE_STATE.isRiskAmountLocked);
  riskAmount = $state<string | null>(INITIAL_TRADE_STATE.riskAmount);
  journalSearchQuery = $state<string>(INITIAL_TRADE_STATE.journalSearchQuery);
  journalFilterStatus = $state<string>(INITIAL_TRADE_STATE.journalFilterStatus);

  // Transient
  /**
   * Holds current active trade data fetched from API/WS.
   * Can be used to sync UI with real position state.
   */
  currentTradeData = $state<Record<string, any> | null>(INITIAL_TRADE_STATE.currentTradeData);
  remoteLeverage = $state<Decimal | undefined>(INITIAL_TRADE_STATE.remoteLeverage);
  remoteMarginMode = $state(INITIAL_TRADE_STATE.remoteMarginMode);
  remoteMakerFee = $state<Decimal | undefined>(INITIAL_TRADE_STATE.remoteMakerFee);
  remoteTakerFee = $state<Decimal | undefined>(INITIAL_TRADE_STATE.remoteTakerFee);
  feeMode = $state(INITIAL_TRADE_STATE.feeMode);
  exitFees = $state<Decimal | undefined>(INITIAL_TRADE_STATE.exitFees);
  private notifyTimer: any = null;

  constructor() {
    if (browser) {
      this.load();

      // Auto-save effect
      $effect.root(() => {
        $effect(() => {
          // Explicitly track dependencies by reading snapshot
          const snap = this.getSnapshot();
          this.saveDebounced(snap);

          // Debounced update for in-memory listeners (UI sync, etc.)
          untrack(() => {
            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
              this.notifyListeners(snap);
            }, 50);
          });
        });
      });
    }
  }

  private load() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = safeJsonParse(stored);

        // Use Zod for validation and cleaning
        const result = TradeStateSchema.safeParse(parsed);

        if (result.success) {
          const data = result.data;
          this.tradeType = data.tradeType;
          this.accountSize = data.accountSize;
          this.riskPercentage = data.riskPercentage;
          this.entryPrice = data.entryPrice;
          this.stopLossPrice = data.stopLossPrice;
          this.leverage = data.leverage;
          this.fees = data.fees;
          this.symbol = data.symbol;
          this.atrValue = data.atrValue;
          this.atrMultiplier = data.atrMultiplier;
          this.useAtrSl = data.useAtrSl;
          this.atrMode = data.atrMode;
          this.atrTimeframe = data.atrTimeframe;
          this.analysisTimeframe = data.analysisTimeframe;
          this.tradeNotes = data.tradeNotes;
          // Security Hardening: Cap tags to 50
          this.tags = (data.tags || []).slice(0, 50);
          this.journalSearchQuery = data.journalSearchQuery;
          this.journalFilterStatus = data.journalFilterStatus;

          // Handle Decimal/Special fields
          this.isPositionSizeLocked = data.isPositionSizeLocked;
          this.lockedPositionSize = data.lockedPositionSize;
          this.isRiskAmountLocked = data.isRiskAmountLocked;
          this.riskAmount = data.riskAmount;

          // Logic for targets
          const hasAnyPrice = data.targets?.some(
            (t: any) => t.price !== null && t.price !== "0",
          );
          if (!data.targets || data.targets.length === 0 || !hasAnyPrice) {
            this.targets = structuredClone(INITIAL_TRADE_STATE.targets);
          } else {
            // Security Hardening: Cap targets to 20
            this.targets = data.targets.slice(0, 20);
          }

        } else {
          if (import.meta.env.DEV) {
            console.warn("Trade state validation failed, using defaults", result.error);
          }
          this.resetToDefaults();
        }

      } else {
        this.resetToDefaults();
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("Failed to load trade state", e);
      }
      this.resetToDefaults();
    }
  }

  private resetToDefaults() {
    // Bulk reset to initial state
    this.tradeType = INITIAL_TRADE_STATE.tradeType;
    this.accountSize = INITIAL_TRADE_STATE.accountSize;
    this.riskPercentage = INITIAL_TRADE_STATE.riskPercentage;
    this.entryPrice = INITIAL_TRADE_STATE.entryPrice;
    this.stopLossPrice = INITIAL_TRADE_STATE.stopLossPrice;
    this.leverage = INITIAL_TRADE_STATE.leverage;
    this.fees = INITIAL_TRADE_STATE.fees;
    this.symbol = INITIAL_TRADE_STATE.symbol;
    this.atrValue = INITIAL_TRADE_STATE.atrValue;
    this.atrMultiplier = INITIAL_TRADE_STATE.atrMultiplier;
    this.useAtrSl = INITIAL_TRADE_STATE.useAtrSl;
    this.atrMode = INITIAL_TRADE_STATE.atrMode;
    this.atrTimeframe = INITIAL_TRADE_STATE.atrTimeframe;
    this.tradeNotes = INITIAL_TRADE_STATE.tradeNotes;
    this.tags = [...INITIAL_TRADE_STATE.tags];
    this.targets = structuredClone(INITIAL_TRADE_STATE.targets);
    this.isPositionSizeLocked = INITIAL_TRADE_STATE.isPositionSizeLocked;
    this.lockedPositionSize = INITIAL_TRADE_STATE.lockedPositionSize;
    this.isRiskAmountLocked = INITIAL_TRADE_STATE.isRiskAmountLocked;
    this.riskAmount = INITIAL_TRADE_STATE.riskAmount;
  }

  private saveDebounced = debounce((snapshot: any) => {
    if (!browser) return;
    try {
      const toSave: any = { ...snapshot };

      delete toSave.currentTradeData;
      delete toSave.remoteLeverage;
      delete toSave.remoteMarginMode;
      delete toSave.remoteMakerFee;
      delete toSave.remoteTakerFee;
      delete toSave.exitFees;
      delete toSave.feeMode;

      // Convert Decimal to string for storage
      if (toSave.lockedPositionSize instanceof Decimal) {
        toSave.lockedPositionSize = toSave.lockedPositionSize.toString();
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("Failed to save trade state", e);
      }
    }
  }, 1000);

  private save() {
    // Legacy sync save if needed, or alias to immediate execution
    // But for Runes effect we use saveDebounced directly.
    const snap = this.getSnapshot();
    this.saveDebounced(snap);
    this.notifyListeners(snap);
  }

  setSymbol(
    symbol: string,
    provider: "bitunix" | "binance" = "bitunix",
  ): boolean {
    if (!symbol) {
      this.symbol = "";
      return true;
    }
    const normalized = normalizeSymbol(symbol, provider);
    if (!normalized) {
      if (import.meta.env.DEV) {
        console.warn("[tradeState] Invalid symbol:", symbol);
      }
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

  resetInputs(preserveSymbol = true, preserveTradeType = true) {
    const currentSymbol = this.symbol;
    const currentTradeType = this.tradeType;

    // Reset everything to deep copy of initial state to prevent reference issues
    const defaults = structuredClone(INITIAL_TRADE_STATE);
    Object.assign(this, defaults);

    // Restore preserved values
    if (preserveSymbol) {
      this.symbol = currentSymbol;
    }
    if (preserveTradeType) {
      this.tradeType = currentTradeType;
    }

    // Ensure reactivity for targets array if replaced completely
    // (though Object.assign handles it, explicit re-assignment can help triggers)
    // this.targets = defaults.targets;
  }

  // Helper for legacy 'update' pattern
  update(fn: (curr: any) => any) {
    // Create a snapshot object
    const snap = this.getSnapshot();
    const next = fn(snap);

    // Apply back properties to this instance (Svelte 5 Runes)
    // We iterate keys to trigger individual property setters if needed,
    // though Object.assign works for class properties in Runes too.
    Object.assign(this, next);

    // Handle nested Decimal if replaced (lockedPositionSize)
    if (
      next.lockedPositionSize &&
      !(next.lockedPositionSize instanceof Decimal)
    ) {
      try {
        this.lockedPositionSize = new Decimal(next.lockedPositionSize);
      } catch (e) { /* ignore */ }
    }

    // Ensure reactivity for targets array if replaced completely
    // Object.assign handles this, but explicit assignment ensures Runes signal works if Object.assign behavior varies
    if (next.targets && next.targets !== this.targets) {
      // Security Hardening: Cap targets to 20 on update
      this.targets = next.targets.slice(0, 20);
    }

    // Security Hardening: Cap tags on update
    if (next.tags && next.tags !== this.tags) {
      this.tags = next.tags.slice(0, 50);
    }

    this.notifyListeners();
  }

  // Helper for legacy 'set' pattern (useful for tests)
  set(newState: any) {
    Object.assign(this, newState);

    if (
      newState.lockedPositionSize &&
      !(newState.lockedPositionSize instanceof Decimal)
    ) {
      try {
        this.lockedPositionSize = new Decimal(newState.lockedPositionSize);
      } catch (e) {
        /* ignore */
      }
    }

    // Ensure targets reactivity
    if (newState.targets) {
      this.targets = newState.targets;
    }
  }

  getSnapshot(): TradeStateSnapshot {
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

  private notifyListeners(snap?: any) {
    // Synchronous notification to prevent race conditions
    const s = snap || this.getSnapshot();
    this.listeners.forEach((fn) => fn(s));
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
