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
import { get } from "svelte/store";

import { tradeState } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { presetState } from "../stores/preset.svelte";
import { journalState } from "../stores/journal.svelte";
import { uiState } from "../stores/ui.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CalculatorService } from "./calculatorService";
import { marketState } from "../stores/market.svelte";
import { bitunixWs } from "./bitunixWs";
import { bitgetWs } from "./bitgetWs"; // Import Bitget WS
import { favoritesState } from "../stores/favorites.svelte";
import { _, locale } from "../locales/i18n";
import { syncService } from "./syncService";
import { csvService } from "./csvService";
import { apiService } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { modalState } from "../stores/modal.svelte";
import { normalizeJournalEntry, parseDecimal } from "../utils/utils";
import { safeJsonParse } from "../utils/safeJson";
import type {
  JournalEntry,
  TradeValues,
  IndividualTpResult,
  BaseMetrics,
} from "../stores/types";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { trackCustomEvent, addContextProvider } from "./trackingService";
import { onboardingService } from "./onboardingService";
import { storageUtils } from "../utils/storageUtils";
import { marketWatcher } from "./marketWatcher";
import { connectionManager } from "./connectionManager";
import { normalizeSymbol } from "../utils/symbolUtils";
import { tradeCalculator } from "./tradeCalculator.svelte";
import { marketAnalyst } from "./marketAnalyst";
import { serializationService } from "./serializationService";

const calculatorService = new CalculatorService(calculator, uiState);

let marketStoreUnsubscribe: (() => void) | null = null;
let tradeStoreUnsubscribe: (() => void) | null = null;
let isInitialized = false;
let saveJournalTask: Promise<void> | null = null;
let pendingJournalData: JournalEntry[] | null = null;

export const app = {
  calculator: calculator,
  uiManager: uiState,
  currentMarketPrice: null as Decimal | null,

  init: () => {
    if (browser) {
      if (isInitialized) return;
      isInitialized = true;

      // 0. Setup Tracking Context
      addContextProvider(() => {
        return {
          app_theme: uiState.currentTheme,
          app_symbol: tradeState.symbol,
          app_provider: settingsState.apiProvider,
          app_background: settingsState.backgroundType,
          app_modals: uiState.windows.map((w) => w.id).join(","),
          app_viewport: `${window.innerWidth}x${window.innerHeight}`,
          app_zoom: window.devicePixelRatio,
          app_version: import.meta.env.VITE_APP_VERSION,
        };
      });

      // 1. Initialise core logic
      app.populatePresetLoader();
      app.setupMarketSync();
      tradeCalculator.init(() => app.calculateAndDisplay());

      // 2. Register dependencies in ConnectionManager
      connectionManager.registerProvider("bitunix", bitunixWs);
      connectionManager.registerProvider("bitget", bitgetWs);
      connectionManager.registerPolling(marketWatcher);

      // 3. Setup Reactions
      app.setupRealtimeUpdates();

      // 4. Force initial state on first start or after update
      app.setupFirstStart();

      // 5. Initial connection
      connectionManager.switchProvider(settingsState.apiProvider || "bitunix", { force: true });

      // Fetch initial price data
      app.handleFetchPrice();
      app.fetchAtr(true);

      // 6. Start Market Analyst
      marketAnalyst.start();
    }
  },

  setupFirstStart: () => {
    if (!browser) return;
    const INIT_KEY = "cachy_init_v501";
    if (!localStorage.getItem(INIT_KEY)) {
      // Set favorites
      favoritesState.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];

      // Update trade state for full action
      tradeState.update((s) => ({
        ...s,
        symbol: "BTCUSDT",
        entryPrice: "88480.2", // User screenshot value
        atrValue: "45.5",
        atrMultiplier: 1.2,
        useAtrSl: true,
        atrMode: "auto",
        targets: [
          { price: 120000, percent: 50, isLocked: false },
          { price: 122000, percent: 25, isLocked: false },
          { price: 124000, percent: 25, isLocked: false },
        ],
      }));

      // Settings for visibility
      settingsState.showMarketActivity = true; // Show details in tiles
      settingsState.showSidebarActivity = false; // Hide sidebar
      settingsState.showMarketSentiment = true;
      settingsState.showMarketSentiment = true;
      settingsState.enableNewsAnalysis = true;
      settingsState.marketMode = "balanced"; // Default to smart balanced mode

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

        const currentKeys = s.apiProvider === "bitget"
          ? `${s.apiKeys.bitget.key}:${s.apiKeys.bitget.secret}:${s.apiKeys.bitget.passphrase}`
          : `${s.apiKeys.bitunix.key}:${s.apiKeys.bitunix.secret}`;

        const providerChanged = s.apiProvider !== lastProvider;
        const keysChanged = currentKeys !== lastKeys;

        if (s.apiProvider === "bitget") {
          // Ensure Bitunix is dead
          if (bitunixWs) bitunixWs.destroy();

          if (providerChanged || keysChanged) {
            lastKeys = currentKeys;
            lastProvider = s.apiProvider;
            if (browser) {
              // Ensure we start fresh
              (bitgetWs as any).isDestroyed = false;
              bitgetWs.connect(true);
            }
          }
        } else {
          // Ensure Bitget is dead
          if (bitgetWs) bitgetWs.destroy();

          if (providerChanged || keysChanged) {
            lastKeys = currentKeys;
            lastProvider = s.apiProvider;
            if (browser) {
              (bitunixWs as any).isDestroyed = false;
              bitunixWs.connect();
            }
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
      const provider = settingsState.apiProvider;
      const newSymbol = state.symbol
        ? normalizeSymbol(state.symbol, provider)
        : "";

      if (symbolDebounceTimer) clearTimeout(symbolDebounceTimer);

      symbolDebounceTimer = setTimeout(() => {
        if (newSymbol && newSymbol !== currentWatchedSymbol) {
          if (currentWatchedSymbol) {
            marketWatcher.unregister(currentWatchedSymbol, "price");
            marketWatcher.unregister(currentWatchedSymbol, "ticker");
          }
          // Subscribe to BOTH Price (Funding/Index) and Ticker (Last/Vol/Change)
          marketWatcher.register(newSymbol, "price");
          marketWatcher.register(newSymbol, "ticker");
          currentWatchedSymbol = newSymbol;
        } else if (!newSymbol && currentWatchedSymbol) {
          marketWatcher.unregister(currentWatchedSymbol, "price");
          marketWatcher.unregister(currentWatchedSymbol, "ticker");
          currentWatchedSymbol = null;
        }
      }, 500);
    });

    if (marketStoreUnsubscribe) marketStoreUnsubscribe();
    marketStoreUnsubscribe = marketState.subscribe((data) => {
      const state = tradeState;
      const settings = settingsState;

      if (state.symbol) {
        const normSymbol = normalizeSymbol(state.symbol, settings.apiProvider);
        const marketData = data[normSymbol];

        if (marketData && marketData.lastPrice) {
          app.currentMarketPrice = marketData.lastPrice;

          if (settings.autoUpdatePriceInput) {
            const newPrice = new Decimal(marketData.lastPrice).toString();
            if (state.entryPrice !== newPrice) {
              tradeState.update((s) => ({ ...s, entryPrice: newPrice }));
            }
          }
        }
      }
    });

    marketState.subscribeStatus((status) => {
      if (status === "disconnected" || status === "reconnecting") {
        const settings = settingsState;
        if (
          settings.autoUpdatePriceInput
        ) {
          // Fallback handled by marketWatcher polling
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
      const d =
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
      const parsedData = safeJsonParse(d);
      return Array.isArray(parsedData)
        ? parsedData.map(normalizeJournalEntry)
        : [];
    } catch {
      return [];
    }
  },

    saveJournal: async (d: JournalEntry[]) => {
    if (!browser) return;

    pendingJournalData = d;
    if (saveJournalTask) return saveJournalTask;

    saveJournalTask = new Promise<void>((resolve) => {
      // @ts-ignore
      const schedule = (window.requestIdleCallback) || ((cb: any) => setTimeout(cb, 1000));

      schedule(async () => {
        while (pendingJournalData) {
           const dataToSave = pendingJournalData;
           pendingJournalData = null;

           try {
             const json = await serializationService.stringifyAsync(dataToSave);
             storageUtils.safeSetItem(
               CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
               json,
             );
           } catch (error) {
             uiState.showError("Speichern fehlgeschlagen.");
           }
        }
        saveJournalTask = null;
        resolve();
      }, { timeout: 3000 });
    });

    return saveJournalTask;
  },

  addTrade: async () => {
    const currentAppState = tradeState;
    if (!currentAppState.currentTradeData?.positionSize?.gt(0)) {
      uiState.showError("errors.invalidTrade");
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
    await app.saveJournal(journalData);
    journalState.set(journalData);
    uiState.showFeedback("save");
  },

  updateTradeStatus: async (id: number, newStatus: string) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex((t) => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex].status = newStatus;
      await app.saveJournal(journalData);
      journalState.set(journalData);
    }
  },

  updateTrade: async (id: number, updates: Partial<JournalEntry>) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex((t) => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex] = { ...journalData[tradeIndex], ...updates };
      await app.saveJournal(journalData);
      journalState.set(journalData);
    }
  },

  deleteTrade: async (id: number) => {
    const d = app.getJournal().filter((t) => t.id != id);
    await app.saveJournal(d);
    journalState.set(d);
  },

  async clearJournal() {
    const confirmed = await modalState.show(
      "modals.clearJournal.title",
      "modals.clearJournal.message",
      "confirm",
    );
    if (confirmed) {
      await app.saveJournal([]);
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
    const name = await modalState.show(
      "modals.savePreset.title",
      "modals.savePreset.prompt",
      "prompt",
    );
    if (typeof name === "string" && name) {
      const presets = safeJsonParse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
      );
      presets[name] = app.getInputsAsObject();
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
        JSON.stringify(presets),
      );
      app.populatePresetLoader();
      uiState.showFeedback("save");
    }
  },

  loadPreset: (name: string) => {
    const presets = safeJsonParse(
      localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
    );
    const p = presets[name];
    if (p) {
      // Ensure strings for legacy presets
      if (typeof p.entryPrice === 'number') p.entryPrice = String(p.entryPrice);
      if (typeof p.stopLossPrice === 'number') p.stopLossPrice = String(p.stopLossPrice);
      if (typeof p.riskAmount === 'number') p.riskAmount = String(p.riskAmount);

      tradeState.update((s) => ({
        ...s,
        ...p,
        entryPrice: app.currentMarketPrice ? new Decimal(app.currentMarketPrice).toString() : s.entryPrice,
      }));
      if (p.useAtrSl) tradeState.atrMode = "auto";
      app.calculateAndDisplay();
    }
  },

  deletePreset: async (name: string) => {
    const presets = safeJsonParse(
      localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
    );
    delete presets[name];
    localStorage.setItem(
      CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
      JSON.stringify(presets),
    );
    app.populatePresetLoader();
  },

  populatePresetLoader: () => {
    const presets = safeJsonParse(
      localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
    );
    presetState.availablePresets = Object.keys(presets);
  },

  exportToCSV: () => {
    if (!browser) return; // SSR-Guard
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
        const t = get(_);
        const confirmed = await modalState.show(
          t("modals.import.title"),
          t("modals.import.message", { values: { count: entries.length } }),
          "confirm",
        );
        if (confirmed) {
          const combined = [...journalState.entries, ...entries];
          const unique = Array.from(
            new Map(combined.map((t) => [t.id, t])).values(),
          );
          await app.saveJournal(unique);
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
      console.log(`[handleFetchPrice] Fetching price for ${symbol} via ${settingsState.apiProvider}`);
      const ticker = await apiService.fetchTicker24h(
        symbol,
        settingsState.apiProvider,
      );
      console.log(`[handleFetchPrice] Fetched ticker:`, ticker);
      const priceVal = ticker.lastPrice;

      app.currentMarketPrice = priceVal;
      tradeState.update((s) => ({ ...s, entryPrice: new Decimal(priceVal).toString() }));
      console.log(`[handleFetchPrice] Updated tradeState entryPrice to`, new Decimal(priceVal).toString());
      app.calculateAndDisplay();
    } catch (e) {
      console.log(`[handleFetchPrice] Error fetching price:`, e);
      if (!isAuto) uiState.showError("errors.priceFetchFailed");
    } finally {
      if (!isAuto) uiState.isPriceFetching = false;
    }
  },

  setAtrMode: (mode: "manual" | "auto") => {
    tradeState.update((s) => ({ ...s, atrMode: mode }));
    if (mode === "auto") app.fetchAtr();
    app.calculateAndDisplay();
  },

  setAtrTimeframe: (timeframe: string) => {
    tradeState.update((s) => ({ ...s, atrTimeframe: timeframe }));
    if (tradeState.atrMode === "auto") app.fetchAtr();
  },

  fetchAtr: async (isAuto = false) => {
    const symbol = tradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) return;
    if (!isAuto) uiState.isAtrFetching = true;
    try {
      const klines =
        settingsState.apiProvider === "bitget"
          ? await apiService.fetchBitgetKlines(
            symbol,
            tradeState.atrTimeframe,
            15,
          )
          : await apiService.fetchBitunixKlines(
            symbol,
            tradeState.atrTimeframe,
            15,
          );
      const atr = calculator.calculateATR(klines);
      tradeState.update((s) => ({ ...s, atrValue: new Decimal(atr).toDP(20).toString() }));
      app.calculateAndDisplay();
    } catch (e) {
      if (!isAuto) uiState.showError("errors.atrFetchFailed");
    } finally {
      if (!isAuto) uiState.isAtrFetching = false;
    }
  },

  selectSymbolSuggestion: (symbol: string) => {
    tradeState.update((s) => ({ ...s, symbol }));
    app.handleFetchPrice();
    app.fetchAtr(true);
  },

  syncBitunixHistory: async () => {
    await syncService.syncBitunixPositions();
  },

  toggleRiskAmountLock() {
    const isLocked = !tradeState.isRiskAmountLocked;
    tradeState.update((s) => ({
      ...s,
      isRiskAmountLocked: isLocked,
      isPositionSizeLocked: isLocked ? false : s.isPositionSizeLocked,
      lockedPositionSize: isLocked ? null : s.lockedPositionSize,
    }));
  },

  togglePositionSizeLock() {
    const isLocked = !tradeState.isPositionSizeLocked;
    const currentSize =
      resultsState.positionSize && resultsState.positionSize !== "-"
        ? new Decimal(resultsState.positionSize.replace(/,/g, ""))
        : null;

    tradeState.update((s) => ({
      ...s,
      isPositionSizeLocked: isLocked,
      lockedPositionSize: isLocked ? currentSize : null,
      isRiskAmountLocked: isLocked ? false : s.isRiskAmountLocked,
    }));
  },

  addTakeProfitRow() {
    const currentTargets = tradeState.targets;
    if (currentTargets.length >= 10) return;

    const newTargets = [
      ...currentTargets,
      { price: null, percent: "0", isLocked: false },
    ];
    tradeState.update((s) => ({ ...s, targets: newTargets }));
    app.adjustTpPercentages(null);
  },

  removeTakeProfitRow(index: number) {
    const currentTargets = [...tradeState.targets];
    if (currentTargets.length <= 1) return;

    currentTargets.splice(index, 1);
    tradeState.update((s) => ({ ...s, targets: currentTargets }));
    app.adjustTpPercentages(index);
  },

  adjustTpPercentages(changedIndex: number | null) {
    const targets = [...tradeState.targets];
    if (targets.length === 0) return;

    // Prevent adjustment if the changed target is locked
    if (changedIndex !== null && targets[changedIndex]?.isLocked) return;

    const total = targets.reduce((sum, t) => sum.plus(parseDecimal(t.percent)), new Decimal(0));
    const diff = new Decimal(100).minus(total);

    if (diff.abs().lt(0.0001)) return;

    // If only one target, it must be 100%
    if (targets.length === 1) {
      targets[0].percent = "100";
      tradeState.update((s) => ({ ...s, targets }));
      return;
    }

    const unlockedIndices = targets
      .map((t, i) => (!t.isLocked && i !== changedIndex ? i : -1))
      .filter((i) => i !== -1);

    if (unlockedIndices.length === 0) {
      // Revert change if no other unlocked targets
      if (changedIndex !== null) {
        const oldTotalExceptChanged = targets.reduce(
          (sum, t, i) => (i !== changedIndex ? sum.plus(parseDecimal(t.percent)) : sum),
          new Decimal(0),
        );
        targets[changedIndex].percent = new Decimal(100).minus(oldTotalExceptChanged).toString();
        tradeState.update((s) => ({ ...s, targets }));
      }
      return;
    }

    if (diff.gt(0)) {
      // Surplus: distribute to all unlocked
      const share = diff.div(unlockedIndices.length);
      unlockedIndices.forEach((i) => {
        const current = parseDecimal(targets[i].percent);
        targets[i].percent = current.plus(share).toString();
      });
    } else {
      // Deficit: take from unlocked targets starting from last
      let remainingDeficit = diff.abs();
      for (let i = targets.length - 1; i >= 0; i--) {
        if (unlockedIndices.includes(i)) {
          const current = parseDecimal(targets[i].percent);
          const take = Decimal.min(current, remainingDeficit);
          targets[i].percent = current.minus(take).toString();
          remainingDeficit = remainingDeficit.minus(take);
          if (remainingDeficit.lte(0)) break;
        }
      }
    }

    tradeState.update((s) => ({ ...s, targets }));
    app.calculateAndDisplay();
  },

  updateSymbolSuggestions: (input: string) => {
    if (!input || input.length < 1) {
      uiState.symbolSuggestions = [];
      uiState.showSymbolSuggestions = false;
      return;
    }
    // Simple filter of favorite symbols or common ones
    const suggestions = settingsState.favoriteSymbols.filter((s) =>
      s.toLowerCase().includes(input.toLowerCase()),
    );
    uiState.symbolSuggestions = suggestions;
    uiState.showSymbolSuggestions = suggestions.length > 0;
  },

  fetchAllAnalysisData: async (symbol?: string, isAuto = false) => {
    if (symbol && symbol !== tradeState.symbol) {
      tradeState.update((s) => ({ ...s, symbol }));
    }
    await app.handleFetchPrice(isAuto);
    await app.fetchAtr(isAuto);
  },
};
