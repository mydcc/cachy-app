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

import { get } from "svelte/store";
import { settingsStore } from "../stores/settingsStore";
import {
  tradeStore,
  updateTradeStore,
  resetAllInputs,
} from "../stores/tradeStore";
import { favoritesStore } from "../stores/favoritesStore";
import { uiStore } from "../stores/uiStore";
import { app } from "./app";
import { modalManager } from "./modalManager";
import { CONSTANTS } from "../lib/constants";

// --- Types & Constants ---

export type HotkeyCategory =
  | "Favorites"
  | "Trade Setup"
  | "UI & Navigation"
  | "Market Data"
  | "System";

export interface HotkeyAction {
  id: string;
  label: string;
  category: HotkeyCategory;
  defaultKey: string; // Used as default for Custom mode
  action: () => void;
}

// Define IDs for elements we need to focus
const IDs = {
  ENTRY_PRICE: "entry-price-input",
  STOP_LOSS: "stop-loss-price-input",
  SYMBOL: "symbol-input",
  TP_PRICE_PREFIX: "tp-price-",
  TP_ADD_BTN: "add-tp-btn",
};

// --- Helper Functions ---

function isInputActive(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  const tagName = activeElement.tagName.toLowerCase();
  return (
    (tagName === "input" || tagName === "textarea" || tagName === "select") &&
    (activeElement as HTMLElement).isContentEditable !== false
  );
}

function focusElement(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.focus();
    if (el instanceof HTMLInputElement) {
      el.select();
    }
  }
}

function loadFavorite(index: number) {
  // 1-based index
  const favorites = get(favoritesStore);
  if (favorites.length >= index) {
    const symbol = favorites[index - 1];
    if (symbol) {
      app.selectSymbolSuggestion(symbol);
    }
  }
}

function cycleTakeProfitFocus(reverse: boolean = false) {
  const state = get(tradeStore);
  const targets = state.targets;
  const count = targets.length;

  if (count === 0) return;

  const activeElement = document.activeElement;
  let currentIndex = -1;

  if (activeElement && activeElement.id.startsWith(IDs.TP_PRICE_PREFIX)) {
    currentIndex = parseInt(
      activeElement.id.replace(IDs.TP_PRICE_PREFIX, ""),
      10,
    );
  }

  let nextIndex;
  if (currentIndex === -1) {
    nextIndex = reverse ? count - 1 : 0;
  } else {
    if (reverse) {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = count - 1;
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= count) nextIndex = 0;
    }
  }
  focusElement(`${IDs.TP_PRICE_PREFIX}${nextIndex}`);
}

function removeLastTakeProfit() {
  const state = get(tradeStore);
  if (state.targets.length > 0) {
    const newTargets = state.targets.slice(0, -1);
    updateTradeStore((s) => ({ ...s, targets: newTargets }));
    app.adjustTpPercentages(null);
  }
}

// --- Action Definitions ---

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  // --- Favorites ---
  {
    id: "FAV_1",
    label: "Load Favorite 1",
    category: "Favorites",
    defaultKey: "Alt+1",
    action: () => loadFavorite(1),
  },
  {
    id: "FAV_2",
    label: "Load Favorite 2",
    category: "Favorites",
    defaultKey: "Alt+2",
    action: () => loadFavorite(2),
  },
  {
    id: "FAV_3",
    label: "Load Favorite 3",
    category: "Favorites",
    defaultKey: "Alt+3",
    action: () => loadFavorite(3),
  },
  {
    id: "FAV_4",
    label: "Load Favorite 4",
    category: "Favorites",
    defaultKey: "Alt+4",
    action: () => loadFavorite(4),
  },

  // --- Trade Setup ---
  {
    id: "FOCUS_ENTRY",
    label: "Focus Entry Price",
    category: "Trade Setup",
    defaultKey: "Alt+E",
    action: () => focusElement(IDs.ENTRY_PRICE),
  },
  {
    id: "FOCUS_SL",
    label: "Focus Stop Loss",
    category: "Trade Setup",
    defaultKey: "Alt+O",
    action: () => focusElement(IDs.STOP_LOSS),
  },
  {
    id: "FOCUS_TP_NEXT",
    label: "Focus Next TP",
    category: "Trade Setup",
    defaultKey: "Alt+T",
    action: () => cycleTakeProfitFocus(false),
  },
  {
    id: "FOCUS_TP_PREV",
    label: "Focus Previous TP",
    category: "Trade Setup",
    defaultKey: "Alt+Shift+T",
    action: () => cycleTakeProfitFocus(true),
  },
  {
    id: "ADD_TP",
    label: "Add TP Target",
    category: "Trade Setup",
    defaultKey: "Alt+Plus",
    action: () => app.addTakeProfitRow(),
  },
  {
    id: "REMOVE_TP",
    label: "Remove TP Target",
    category: "Trade Setup",
    defaultKey: "Alt+Minus",
    action: () => removeLastTakeProfit(),
  },
  {
    id: "SET_LONG",
    label: "Set Direction Long",
    category: "Trade Setup",
    defaultKey: "Alt+L",
    action: () =>
      updateTradeStore((s) => ({ ...s, tradeType: CONSTANTS.TRADE_TYPE_LONG })),
  },
  {
    id: "SET_SHORT",
    label: "Set Direction Short",
    category: "Trade Setup",
    defaultKey: "Alt+S",
    action: () =>
      updateTradeStore((s) => ({
        ...s,
        tradeType: CONSTANTS.TRADE_TYPE_SHORT,
      })),
  },
  {
    id: "RESET_INPUTS",
    label: "Reset Trade Inputs",
    category: "Trade Setup",
    defaultKey: "Alt+R",
    action: () => resetAllInputs(),
  },

  // --- UI & Navigation ---
  {
    id: "OPEN_JOURNAL",
    label: "Toggle Journal",
    category: "UI & Navigation",
    defaultKey: "Alt+J",
    action: () => uiStore.toggleJournalModal(true),
  },
  {
    id: "TOGGLE_SETTINGS",
    label: "Open Settings",
    category: "UI & Navigation",
    defaultKey: "Alt+,",
    action: () => uiStore.toggleSettingsModal(true),
  },
  {
    id: "TOGGLE_SIDEBAR",
    label: "Toggle Sidebars",
    category: "UI & Navigation",
    defaultKey: "Alt+B",
    action: () =>
      settingsStore.update((s) => ({ ...s, showSidebars: !s.showSidebars })),
  },
  {
    id: "TOGGLE_TECHNICALS",
    label: "Toggle Technicals Panel",
    category: "UI & Navigation",
    defaultKey: "Alt+K",
    action: () =>
      settingsStore.update((s) => ({
        ...s,
        showTechnicals: !s.showTechnicals,
      })),
  },

  // --- Market Data ---
  {
    id: "FETCH_PRICE",
    label: "Fetch Price",
    category: "Market Data",
    defaultKey: "Alt+P",
    action: () => app.handleFetchPrice(),
  },
  {
    id: "TOGGLE_SYMBOL_PICKER",
    label: "Open Symbol Picker",
    category: "UI & Navigation",
    defaultKey: "Alt+F",
    action: () => modalManager.show("Symbol auswählen", "", "symbolPicker"),
  },
];

// --- Legacy Mode Maps ---

export const MODE1_MAP: Record<string, string> = {
  // Direct Mode
  FAV_1: "1",
  FAV_2: "2",
  FAV_3: "3",
  FAV_4: "4",
  FOCUS_TP_NEXT: "T",
  ADD_TP: "Plus",
  REMOVE_TP: "Minus",
  FOCUS_ENTRY: "E",
  FOCUS_SL: "O",
  SET_LONG: "L",
  SET_SHORT: "S",
  OPEN_JOURNAL: "J",
  FETCH_PRICE: "P",
  TOGGLE_SIDEBAR: "B",
  TOGGLE_TECHNICALS: "K",
  TOGGLE_SETTINGS: ",",
  RESET_INPUTS: "R",
  TOGGLE_SYMBOL_PICKER: "F",
};

export const MODE2_MAP: Record<string, string> = {
  // Safety Mode (Matches defaultKeys mostly)
  FAV_1: "Alt+1",
  FAV_2: "Alt+2",
  FAV_3: "Alt+3",
  FAV_4: "Alt+4",
  FOCUS_TP_NEXT: "Alt+T",
  FOCUS_TP_PREV: "Alt+Shift+T", // Safety mode usually used Shift logic manually, mapped here explicitly
  ADD_TP: "Alt+Plus",
  REMOVE_TP: "Alt+Minus",
  FOCUS_ENTRY: "Alt+E",
  FOCUS_SL: "Alt+O",
  SET_LONG: "Alt+L",
  SET_SHORT: "Alt+S",
  OPEN_JOURNAL: "Alt+J",
  RESET_INPUTS: "Alt+R",
  FETCH_PRICE: "Alt+P",
  TOGGLE_SIDEBAR: "Alt+B",
  TOGGLE_TECHNICALS: "Alt+K",
  TOGGLE_SETTINGS: "Alt+,",
  TOGGLE_SYMBOL_PICKER: "Alt+F",
};

export const MODE3_MAP: Record<string, string> = {
  // Hybrid Mode
  FAV_1: "1",
  FAV_2: "2",
  FAV_3: "3",
  FAV_4: "4",
  FOCUS_TP_NEXT: "T",
  FOCUS_TP_PREV: "Shift+T",
  ADD_TP: "Plus",
  REMOVE_TP: "Minus",
  // Expanded keys for Hybrid (Active when !inputActive)
  FOCUS_ENTRY: "E",
  FOCUS_SL: "O",
  SET_LONG: "L",
  SET_SHORT: "S",
  OPEN_JOURNAL: "J",
  RESET_INPUTS: "R",
  FETCH_PRICE: "P",
  TOGGLE_SIDEBAR: "B",
  TOGGLE_TECHNICALS: "K",
  TOGGLE_SETTINGS: ",",
  TOGGLE_SYMBOL_PICKER: "F",
};

// --- Key Matching Logic ---

export function normalizeKeyCombo(event: KeyboardEvent): string {
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  let key = event.key;
  if (key === " ") key = "Space";
  if (key === "+") key = "Plus";
  if (key === "-") key = "Minus";
  if (key === ",") key = ","; // Explicitly keep comma

  if (["Control", "Alt", "Shift", "Meta"].includes(key)) {
    return parts.join("+");
  }

  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

function isMatch(event: KeyboardEvent, combo: string): boolean {
  const eventCombo = normalizeKeyCombo(event);
  return eventCombo === combo;
}

// --- Main Handler ---

export function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") return;

  const settings = get(settingsStore);
  const mode = settings.hotkeyMode;
  const inputActive = isInputActive();

  let map: Record<string, string> = {};

  switch (mode) {
    case "mode1":
      map = MODE1_MAP;
      break;
    case "mode2":
      map = MODE2_MAP;
      break;
    case "mode3":
      map = MODE3_MAP;
      break;
    case "custom":
      map = settings.customHotkeys || {};
      break;
  }

  for (const action of HOTKEY_ACTIONS) {
    const mappedKey =
      map[action.id] || (mode === "custom" ? action.defaultKey : null);

    if (mappedKey && isMatch(event, mappedKey)) {
      // --- Input Protection Logic ---
      const hasModifier = event.altKey || event.ctrlKey;
      const isFunctionKey = event.key.startsWith("F") && event.key.length > 1;

      if (mode === "mode1") {
        // Direct Mode: Strictly NO inputs allowed
        if (inputActive) continue;
      } else if (mode === "mode2") {
        // Safety Mode: Always allowed (relies on modifiers)
        // No extra check needed
      } else if (mode === "mode3") {
        // Hybrid Mode:
        // - If input is active: ONLY allow if Modifier or Function key
        // - If input NOT active: Allow everything
        if (inputActive && !hasModifier && !isFunctionKey) {
          // Special case for Hybrid: Original logic allowed +/- in some non-text inputs?
          // We simplify to standard protection. If user is typing in a field, 'Plus' should type '+'.
          continue;
        }
      } else if (mode === "custom") {
        if (inputActive && !hasModifier && !isFunctionKey) continue;
      }

      event.preventDefault();
      event.stopPropagation();
      action.action();
      return;
    }
  }
}
