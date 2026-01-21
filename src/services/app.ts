/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// Stores
import { untrack } from "svelte";

import { tradeState } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { presetState } from "../stores/preset.svelte";
import { journalState } from "../stores/journal.svelte";
import { uiState } from "../stores/ui.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CalculatorService } from "./calculatorService";
import { marketState } from "../stores/market.svelte";
import { bitunixWs } from "./bitunixWs"; // Import WS Service
import { favoritesState } from "../stores/favorites.svelte";
import { _ } from "../locales/i18n";
import { syncService } from "./syncService";
import { csvService } from "./csvService";
import { apiService } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { modalState } from "../stores/modal.svelte";
import { normalizeJournalEntry, parseDecimal } from "../utils/utils";
import type {
  JournalEntry,
  TradeValues,
  IndividualTpResult,
  BaseMetrics,
} from "../stores/types";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { trackCustomEvent } from "./trackingService";
import { onboardingService } from "./onboardingService";
import { storageUtils } from "../utils/storageUtils";
import { marketWatcher } from "./marketWatcher";
import { normalizeSymbol } from "../utils/symbolUtils";

const calculatorService = new CalculatorService(
  calculator,
  uiState,
);

let marketStoreUnsubscribe: (() => void) | null = null;
let tradeStoreUnsubscribe: (() => void) | null = null;

export const app = {
  calculator: calculator,
  uiManager: uiState,
  currentMarketPrice: null as Decimal | null,

  init: () => {
    if (browser) {
      app.populatePresetLoader();
      app.setupMarketSync();
      app.setupRealtimeUpdates();
      bitunixWs.connect();

      // Force initial state on first start or after update
      app.setupFirstStart();

      // Fetch initial data immediately
      app.handleFetchPrice();
      app.fetchAtr(true);
    }
  },

  setupFirstStart: () => {
    if (!browser) return;
    const INIT_KEY = "cachy_init_v501";
    if (!localStorage.getItem(INIT_KEY)) {
      // Set favorites
      favoritesState.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];

      // Update trade state for full action
      tradeState.update(s => ({
        ...s,
        symbol: "BTCUSDT",
        entryPrice: 88480.2, // User screenshot value
        atrValue: 45.5,
        atrMultiplier: 1.2,
        useAtrSl: true,
        atrMode: "auto",
        targets: [
          { price: 120000, percent: 50, isLocked: false },
          { price: 122000, percent: 25, isLocked: false },
          { price: 124000, percent: 25, isLocked: false },
        ]
      }));

      // Settings for visibility
      settingsState.showMarketActivity = true; // Show details in tiles
      settingsState.showSidebarActivity = false; // Hide sidebar
      settingsState.showMarketSentiment = true;
      settingsState.enableNewsAnalysis = true;

      localStorage.setItem(INIT_KEY, "true");

      // Give some time for state to settle then calculate
      setTimeout(() => {
        app.calculateAndDisplay();
      }, 100);
    }
  },

  setupRealtimeUpdates: () => {
    if (!browser) return;

    let lastKeys = "";
    let lastProvider = settingsState.apiProvider || "";

    settingsState.subscribe((s: any) => {
      untrack(() => {
        if (!s || !s.apiKeys) return;

        const currentKeys = s.apiKeys.bitunix ? `${s.apiKeys.bitunix.key || ""}:${s.apiKeys.bitunix.secret || ""}` : "";
        const providerChanged = s.apiProvider !== lastProvider;
        const keysChanged = currentKeys !== lastKeys;

        if (s.apiProvider === "bitunix") {
          if ((keysChanged || providerChanged) && s.apiKeys.bitunix?.key && s.apiKeys.bitunix?.secret) {
            lastKeys = currentKeys;
            lastProvider = s.apiProvider;
            if (browser) {
              (bitunixWs as any).isDestroyed = false;
              bitunixWs.connect();
            }
          }
        } else {
          if (providerChanged || lastProvider === "bitunix") {
            lastProvider = s.apiProvider;
            bitunixWs.destroy();
          }
        }
      });
    });

    if (tradeStoreUnsubscribe) {
      tradeStoreUnsubscribe();
      tradeStoreUnsubscribe = null;
    }

    let currentWatchedSymbol: string | null = null;
    let symbolDebounceTimer: any = null;

    tradeStoreUnsubscribe = tradeState.subscribe((state) => {
      const newSymbol = state.symbol ? normalizeSymbol(state.symbol, "bitunix") : "";

      if (symbolDebounceTimer) clearTimeout(symbolDebounceTimer);

      symbolDebounceTimer = setTimeout(() => {
        if (newSymbol && newSymbol !== currentWatchedSymbol) {
          if (currentWatchedSymbol) marketWatcher.unregister(currentWatchedSymbol, "price");
          marketWatcher.register(newSymbol, "price");
          currentWatchedSymbol = newSymbol;
        } else if (!newSymbol && currentWatchedSymbol) {
          marketWatcher.unregister(currentWatchedSymbol, "price");
          currentWatchedSymbol = null;
        }
      }, 500);
    });

    if (marketStoreUnsubscribe) marketStoreUnsubscribe();
    marketStoreUnsubscribe = marketState.subscribe((data) => {
      const state = tradeState;
      const settings = settingsState;

      if (state.symbol) {
        const normSymbol = normalizeSymbol(state.symbol, "bitunix");
        const marketData = data[normSymbol];

        if (marketData && marketData.lastPrice) {
          app.currentMarketPrice = marketData.lastPrice;

          if (settings.autoUpdatePriceInput) {
            const newPrice = marketData.lastPrice.toNumber();
            if (state.entryPrice !== newPrice) {
              tradeState.update(s => ({ ...s, entryPrice: newPrice }));
            }
          }
        }
      }
    });

    marketState.subscribeStatus((status) => {
      if (status === "disconnected" || status === "reconnecting") {
        const settings = settingsState;
        if (settings.autoUpdatePriceInput && settings.apiProvider === "bitunix") {
          // We could trigger a manual fetch here if WS is down
          // But MarketWatcher handles general polling now.
        }
      }
    });
  },

  setupPriceUpdates: () => {
    // Redundant - handled by MarketWatcher
  },

  setupMarketSync: () => {
    // Implementation of market sync if needed
  },

  calculateAndDisplay: () => {
    calculatorService.calculateAndDisplay();
  },

  clearResults: (showGuidance = false) => {
    calculatorService.clearResults(showGuidance);
  },

  getJournal: (): JournalEntry[] => {
    if (!browser) return [];
    const fromStore = journalState.entries;
    if (fromStore && fromStore.length > 0) return fromStore;

    try {
      const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
      const parsedData = JSON.parse(d);
      return Array.isArray(parsedData) ? parsedData.map(normalizeJournalEntry) : [];
    } catch {
      return [];
    }
  },

  saveJournal: (d: JournalEntry[]) => {
    if (!browser) return;
    try {
      storageUtils.safeSetItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, JSON.stringify(d));
    } catch (error) {
      uiState.showError("Speichern fehlgeschlagen.");
    }
  },

  addTrade: () => {
    const currentAppState = tradeState;
    if (!currentAppState.currentTradeData?.positionSize?.gt(0)) {
      uiState.showError("Ungültiger Trade.");
      return;
    }
    const journalData = app.getJournal();
    const newTrade = {
      ...currentAppState.currentTradeData,
      notes: currentAppState.tradeNotes,
      tags: currentAppState.tags || [],
      id: Date.now(),
      date: new Date().toISOString(),
      entryDate: new Date().toISOString(),
    } as JournalEntry;

    journalData.push(newTrade);
    app.saveJournal(journalData);
    journalState.set(journalData);
    uiState.showFeedback("save");
  },

  updateTradeStatus: (id: number, newStatus: string) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex(t => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex].status = newStatus;
      app.saveJournal(journalData);
      journalState.set(journalData);
    }
  },

  updateTrade: (id: number, updates: Partial<JournalEntry>) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex(t => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex] = { ...journalData[tradeIndex], ...updates };
      app.saveJournal(journalData);
      journalState.set(journalData);
    }
  },

  deleteTrade: (id: number) => {
    const d = app.getJournal().filter(t => t.id != id);
    app.saveJournal(d);
    journalState.set(d);
  },

  async clearJournal() {
    const confirmed = await modalState.show("Reset bestätigen", "Journal löschen?", "confirm");
    if (confirmed) {
      app.saveJournal([]);
      journalState.set([]);
    }
  },

  getInputsAsObject: () => {
    const s = tradeState;
    return {
      accountSize: s.accountSize,
      riskPercentage: s.riskPercentage,
      leverage: s.leverage,
      fees: s.fees,
      tradeType: s.tradeType,
      useAtrSl: s.useAtrSl,
      atrMultiplier: s.atrMultiplier,
      symbol: s.symbol,
      targets: s.targets,
      tags: s.tags,
    };
  },

  savePreset: async () => {
    if (!browser) return;
    const name = await modalState.show("Preset speichern", "Name eingeben:", "prompt");
    if (typeof name === "string" && name) {
      const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}");
      presets[name] = app.getInputsAsObject();
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(presets));
      app.populatePresetLoader();
      uiState.showFeedback("save");
    }
  },

  loadPreset: (name: string) => {
    const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}");
    const p = presets[name];
    if (p) {
      tradeState.update(s => ({
        ...s,
        ...p,
        entryPrice: app.currentMarketPrice?.toNumber() || s.entryPrice
      }));
      if (p.useAtrSl) tradeState.atrMode = "auto";
      app.calculateAndDisplay();
    }
  },

  deletePreset: async (name: string) => {
    const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}");
    delete presets[name];
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(presets));
    app.populatePresetLoader();
  },

  populatePresetLoader: () => {
    const presets = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}");
    presetState.availablePresets = Object.keys(presets);
  },

  exportToCSV: () => {
    const journalData = journalState.entries;
    if (journalData.length === 0) return;
    const csv = csvService.generateCSV(journalData);
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = "Journal.csv";
    link.click();
  },

  importFromCSV: (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const entries = csvService.parseCSVContent(text);
      if (entries.length > 0) {
        const confirmed = await modalState.show("Import", `${entries.length} Trades importieren?`, "confirm");
        if (confirmed) {
          const combined = [...journalState.entries, ...entries];
          const unique = Array.from(new Map(combined.map(t => [t.id, t])).values());
          app.saveJournal(unique);
          journalState.set(unique);
        }
      }
    };
    reader.readAsText(file);
  },

  handleFetchPrice: async (isAuto = false) => {
    const symbol = tradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) return;
    if (!isAuto) uiState.isPriceFetching = true;
    try {
      const price = settingsState.apiProvider === "binance" ? await apiService.fetchBinancePrice(symbol) : await apiService.fetchBitunixPrice(symbol);
      app.currentMarketPrice = price;
      tradeState.update(s => ({ ...s, entryPrice: price.toNumber() }));
      app.calculateAndDisplay();
    } catch (e) {
      if (!isAuto) uiState.showError("Preis-Fetch fehlgeschlagen.");
    } finally {
      if (!isAuto) uiState.isPriceFetching = false;
    }
  },

  setAtrMode: (mode: "manual" | "auto") => {
    tradeState.update(s => ({ ...s, atrMode: mode }));
    if (mode === "auto") app.fetchAtr();
    app.calculateAndDisplay();
  },

  setAtrTimeframe: (timeframe: string) => {
    tradeState.update(s => ({ ...s, atrTimeframe: timeframe }));
    if (tradeState.atrMode === "auto") app.fetchAtr();
  },

  fetchAtr: async (isAuto = false) => {
    const symbol = tradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) return;
    if (!isAuto) uiState.isAtrFetching = true;
    try {
      const klines = settingsState.apiProvider === "binance"
        ? await apiService.fetchBinanceKlines(symbol, tradeState.atrTimeframe, 15)
        : await apiService.fetchBitunixKlines(symbol, tradeState.atrTimeframe, 15);
      const atr = calculator.calculateATR(klines);
      tradeState.update(s => ({ ...s, atrValue: atr.toDP(4).toNumber() }));
      app.calculateAndDisplay();
    } catch (e) {
      if (!isAuto) uiState.showError("ATR-Fetch fehlgeschlagen.");
    } finally {
      if (!isAuto) uiState.isAtrFetching = false;
    }
  },

  selectSymbolSuggestion: (symbol: string) => {
    tradeState.update(s => ({ ...s, symbol }));
    app.handleFetchPrice();
    app.fetchAtr(true);
  },

  syncBitunixHistory: async () => {
    await syncService.syncBitunixPositions();
  },

  toggleRiskAmountLock() {
    const isLocked = !tradeState.isRiskAmountLocked;
    tradeState.update(s => ({
      ...s,
      isRiskAmountLocked: isLocked,
      isPositionSizeLocked: isLocked ? false : s.isPositionSizeLocked,
      lockedPositionSize: isLocked ? null : s.lockedPositionSize
    }));
  },

  togglePositionSizeLock() {
    const isLocked = !tradeState.isPositionSizeLocked;
    const currentSize = resultsState.positionSize && resultsState.positionSize !== "-"
      ? new Decimal(resultsState.positionSize.replace(/,/g, ""))
      : null;

    tradeState.update(s => ({
      ...s,
      isPositionSizeLocked: isLocked,
      lockedPositionSize: isLocked ? currentSize : null,
      isRiskAmountLocked: isLocked ? false : s.isRiskAmountLocked
    }));
  },

  addTakeProfitRow() {
    const currentTargets = tradeState.targets;
    if (currentTargets.length >= 10) return;

    const newTargets = [
      ...currentTargets,
      { price: null, percent: 0, isLocked: false }
    ];
    tradeState.update(s => ({ ...s, targets: newTargets }));
    app.adjustTpPercentages(null);
  },

  removeTakeProfitRow(index: number) {
    const currentTargets = [...tradeState.targets];
    if (currentTargets.length <= 1) return;

    currentTargets.splice(index, 1);
    tradeState.update(s => ({ ...s, targets: currentTargets }));
    app.adjustTpPercentages(index);
  },

  adjustTpPercentages(changedIndex: number | null) {
    const targets = [...tradeState.targets];
    if (targets.length === 0) return;

    const total = targets.reduce((sum, t) => sum + (t.percent || 0), 0);
    const diff = 100 - total;

    if (Math.abs(diff) < 0.0001) return;

    // If only one target, it must be 100%
    if (targets.length === 1) {
      targets[0].percent = 100;
      tradeState.update(s => ({ ...s, targets }));
      return;
    }

    const unlockedIndices = targets
      .map((t, i) => (!t.isLocked && i !== changedIndex ? i : -1))
      .filter(i => i !== -1);

    if (unlockedIndices.length === 0) {
      // Revert change if no other unlocked targets
      if (changedIndex !== null) {
        const oldTotalExceptChanged = targets.reduce((sum, t, i) => i !== changedIndex ? sum + (t.percent || 0) : sum, 0);
        targets[changedIndex].percent = 100 - oldTotalExceptChanged;
        tradeState.update(s => ({ ...s, targets }));
      }
      return;
    }

    if (diff > 0) {
      // Surplus: distribute to all unlocked
      const share = diff / unlockedIndices.length;
      unlockedIndices.forEach(i => {
        targets[i].percent = (targets[i].percent || 0) + share;
      });
    } else {
      // Deficit: take from unlocked targets starting from last
      let remainingDeficit = Math.abs(diff);
      for (let i = targets.length - 1; i >= 0; i--) {
        if (unlockedIndices.includes(i)) {
          const current = targets[i].percent || 0;
          const take = Math.min(current, remainingDeficit);
          targets[i].percent = current - take;
          remainingDeficit -= take;
          if (remainingDeficit <= 0) break;
        }
      }
    }

    tradeState.update(s => ({ ...s, targets }));
    app.calculateAndDisplay();
  },

  updateSymbolSuggestions: (input: string) => {
    if (!input || input.length < 1) {
      uiState.symbolSuggestions = [];
      uiState.showSymbolSuggestions = false;
      return;
    }
    // Simple filter of favorite symbols or common ones
    const suggestions = settingsState.favoriteSymbols.filter(s =>
      s.toLowerCase().includes(input.toLowerCase())
    );
    uiState.symbolSuggestions = suggestions;
    uiState.showSymbolSuggestions = suggestions.length > 0;
  },

  fetchAllAnalysisData: async (symbol?: string, isAuto = false) => {
    if (symbol && symbol !== tradeState.symbol) {
      tradeState.update(s => ({ ...s, symbol }));
    }
    await app.handleFetchPrice(isAuto);
    await app.fetchAtr(isAuto);
  }
};
