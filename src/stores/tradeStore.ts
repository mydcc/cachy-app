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

import { writable, get } from "svelte/store";
import { CONSTANTS } from "../lib/constants";
import type { AppState } from "./types";
import { resultsStore, initialResultsState } from "./resultsStore";
import { uiState } from "./ui.svelte";
import { settingsState } from "./settings.svelte";
import { browser } from "$app/environment";
import { normalizeSymbol } from "../utils/symbolUtils";

export const initialTradeState: Pick<
  AppState,
  | "tradeType"
  | "accountSize"
  | "riskPercentage"
  | "entryPrice"
  | "stopLossPrice"
  | "leverage"
  | "fees"
  | "symbol"
  | "atrValue"
  | "atrMultiplier"
  | "useAtrSl"
  | "atrMode"
  | "atrTimeframe"
  | "analysisTimeframe"
  | "tradeNotes"
  | "tags"
  | "targets"
  | "isPositionSizeLocked"
  | "lockedPositionSize"
  | "isRiskAmountLocked"
  | "riskAmount"
  | "journalSearchQuery"
  | "journalFilterStatus"
  | "currentTradeData"
  | "remoteLeverage"
  | "remoteMarginMode"
  | "remoteMakerFee"
  | "remoteTakerFee"
  | "feeMode"
  | "exitFees"
> = {
  tradeType: CONSTANTS.TRADE_TYPE_LONG,
  accountSize: 1000,
  riskPercentage: 1,
  entryPrice: null,
  stopLossPrice: null,
  leverage: parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
  fees: parseFloat(CONSTANTS.DEFAULT_FEES),
  symbol: "",
  atrValue: null,
  atrMultiplier: parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
  useAtrSl: true,
  atrMode: "auto",
  atrTimeframe: "5m",
  analysisTimeframe: "1h",
  tradeNotes: "",
  tags: [],
  targets: [
    { price: null, percent: 50, isLocked: false },
    { price: null, percent: 25, isLocked: false },
    { price: null, percent: 25, isLocked: false },
  ],
  isPositionSizeLocked: false,
  lockedPositionSize: null,
  isRiskAmountLocked: false,
  riskAmount: null,
  journalSearchQuery: "",
  journalFilterStatus: "all",
  currentTradeData: null,
  remoteLeverage: undefined,
  remoteMarginMode: undefined,
  remoteMakerFee: undefined,
  remoteTakerFee: undefined,
  feeMode: "maker_taker",
  exitFees: undefined,
};

function loadTradeStateFromLocalStorage(): typeof initialTradeState {
  if (!browser) return JSON.parse(JSON.stringify(initialTradeState));
  try {
    const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_TRADE_KEY);
    if (!d) return JSON.parse(JSON.stringify(initialTradeState));
    const parsed = JSON.parse(d);

    // Merge with initial state to ensure all keys exist
    // We override initial defaults with parsed data
    const loadedState = {
      ...JSON.parse(JSON.stringify(initialTradeState)),
      ...parsed,
    };

    // Ensure we always have at least default targets if the array is empty
    // This fixes the issue where targets disappear on reload if they were cleared
    if (!loadedState.targets || loadedState.targets.length === 0) {
      loadedState.targets = JSON.parse(
        JSON.stringify(initialTradeState.targets),
      );
    }

    return loadedState;
  } catch (e) {
    console.warn("Could not load trade state from localStorage", e);
    return JSON.parse(JSON.stringify(initialTradeState));
  }
}

export const tradeStore = writable(loadTradeStateFromLocalStorage());

tradeStore.subscribe((value) => {
  if (browser) {
    try {
      // Create a copy to avoid mutating the store
      const stateToSave = { ...value };

      // Remove derived/transient data that shouldn't be persisted or causes issues
      // currentTradeData contains Decimal objects which stringify to strings, but we re-calculate on load anyway.
      // Also it might be large.
      stateToSave.currentTradeData = null;

      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_TRADE_KEY,
        JSON.stringify(stateToSave),
      );
    } catch (e) {
      console.warn("Could not save trade state to localStorage", e);
    }
  }
});

// Helper function to update parts of the store
export const updateTradeStore = (
  updater: (state: typeof initialTradeState) => typeof initialTradeState,
) => {
  tradeStore.update(updater);
};

// Helper function to toggle ATR inputs visibility
export const toggleAtrInputs = (useAtrSl: boolean) => {
  updateTradeStore((state) => ({
    ...state,
    useAtrSl: useAtrSl,
    atrMode: useAtrSl ? "auto" : state.atrMode,
  }));
};

// Helper function to reset all inputs
export const resetAllInputs = () => {
  const currentSymbol = get(tradeStore).symbol;

  const newState = JSON.parse(JSON.stringify(initialTradeState));
  newState.symbol = currentSymbol;
  newState.useAtrSl = false; // User requested Auto-ATR off
  newState.entryPrice = null; // Ensuring price is cleared
  newState.stopLossPrice = null;

  // Preserve default timeframe/multiplier from initial state (which are 5m, 1.2)

  tradeStore.set(newState);
  resultsStore.set(initialResultsState);

  // Turn off Auto-Price-Update
  settingsState.autoUpdatePriceInput = false;

  uiState.showError("dashboard.promptForData");
};

// Helper function to set symbol with automatic normalization (Single Source of Truth)
export const setSymbol = (
  symbol: string,
  provider: "bitunix" | "binance" = "bitunix",
): boolean => {
  if (!symbol) {
    // Empty symbol is allowed (clear)
    updateTradeStore((state) => ({ ...state, symbol: "" }));
    return true;
  }

  const normalized = normalizeSymbol(symbol, provider);
  if (!normalized) {
    console.warn("[tradeStore] Invalid symbol, normalization failed:", symbol);
    return false;
  }

  updateTradeStore((state) => ({
    ...state,
    symbol: normalized,
  }));

  return true;
};
