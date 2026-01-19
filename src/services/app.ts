/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// Stores
import { tradeState } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { presetState } from "../stores/preset.svelte";
import { journalState } from "../stores/journal.svelte";
import { uiState } from "../stores/ui.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CalculatorService } from "./calculatorService";
import { marketState } from "../stores/market.svelte";
import { bitunixWs } from "./bitunixWs"; // Import WS Service
import { syncService } from "./syncService";
import { csvService } from "./csvService";
import { apiService } from "./apiService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { modalManager } from "./modalManager";
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

interface CSVTradeEntry {
  ID: string;
  Datum: string;
  Uhrzeit: string;
  Symbol: string;
  Typ: string;
  Status: string;
  "Konto Guthaben": string;
  "Risiko %": string;
  Hebel: string;
  "Gebuehren %": string;
  Einstieg: string;
  Exit: string;
  "Stop Loss": string;
  MAE: string;
  MFE: string;
  Efficiency: string;
  "Gewichtetes R/R": string;
  "Gesamt Netto-Gewinn": string;
  "Risiko pro Trade (Waehrung)": string;
  "Gesamte Gebuehren": string;
  "Max. potenzieller Gewinn": string;
  Notizen: string;
  "TP1 Preis"?: string;
  "TP1 %"?: string;
  "TP2 Preis"?: string;
  "TP2 %"?: string;
  "TP3 Preis"?: string;
  "TP3 %"?: string;
  "TP4 Preis"?: string;
  "TP4 %"?: string;
  "TP5 Preis"?: string;
  "TP5 %"?: string;
  [key: string]: string | undefined;
}

let priceUpdateIntervalId: any = null;
let marketStoreUnsubscribe: (() => void) | null = null;
let tradeStoreUnsubscribe: (() => void) | null = null;
let lastCalculationTime = 0;
const CALCULATION_THROTTLE_MS = 200; // Throttle UI updates to max 5 times per second

const calculatorService = new CalculatorService(
  calculator,
  uiState, // Use the exported instance directly
);

export const app = {
  calculator: calculator,
  uiManager: uiState,
  currentMarketPrice: null as Decimal | null,

  init: () => {
    if (browser) {
      app.populatePresetLoader();
      app.calculateAndDisplay();
      app.setupPriceUpdates();
      app.setupRealtimeUpdates(); // Initialize WS updates
      bitunixWs.connect(); // Start WebSockets
    }
  },

  setupRealtimeUpdates: () => {
    if (!browser) return;

    // Watch for API key changes to reconnect private WebSocket
    let lastKeys = "";
    settingsState.subscribe((s: any) => {
      const currentKeys = `${s.apiKeys.bitunix.key}:${s.apiKeys.bitunix.secret}`;
      if (currentKeys !== lastKeys && s.apiKeys.bitunix.key && s.apiKeys.bitunix.secret) {
        lastKeys = currentKeys;
        if (browser) {
          bitunixWs.connect();
        }
      }
    });

    // Cleanup existing subscription to prevent leaks/duplicates
    if (tradeStoreUnsubscribe) {
      tradeStoreUnsubscribe();
      tradeStoreUnsubscribe = null;
    }

    // Watch for symbol changes to manage MarketWatcher registrations
    let currentWatchedSymbol: string | null = null;
    let symbolDebounceTimer: any = null;

    tradeStoreUnsubscribe = tradeState.subscribe((state) => {
      const newSymbol = state.symbol
        ? normalizeSymbol(state.symbol, "bitunix")
        : "";

      if (symbolDebounceTimer) clearTimeout(symbolDebounceTimer);

      symbolDebounceTimer = setTimeout(() => {
        if (newSymbol && newSymbol !== currentWatchedSymbol) {
          if (currentWatchedSymbol) {
            marketWatcher.unregister(currentWatchedSymbol, "price");
          }
          marketWatcher.register(newSymbol, "price");
          currentWatchedSymbol = newSymbol;
        } else if (!newSymbol && currentWatchedSymbol) {
          marketWatcher.unregister(currentWatchedSymbol, "price");
          currentWatchedSymbol = null;
        }
      }, 500);
    });

    // Watch for Market Data updates
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
              tradeState.entryPrice = newPrice;
            }
          }
        }
      }
    });

    // Immediate fallback when WS status changes to disconnected/reconnecting
    marketState.subscribeStatus((status) => {
      if (status === "disconnected" || status === "reconnecting") {
        const settings = settingsState;
        if (settings.autoUpdatePriceInput && settings.apiProvider === "bitunix") {
          app.handleFetchPrice(true);
        }
      }
    });
  },

  setupPriceUpdates: () => {
    if (!browser) return;

    // Watch settings, status and symbol changes to adjust interval
    settingsState.subscribe(() => app.refreshPriceUpdateInterval());
    marketState.subscribeStatus(() => app.refreshPriceUpdateInterval());

    // Initial setup
    app.refreshPriceUpdateInterval();
  },

  refreshPriceUpdateInterval: () => {
    if (priceUpdateIntervalId) {
      clearInterval(priceUpdateIntervalId);
      priceUpdateIntervalId = null;
    }

    const settings = settingsState;
    const wsStatus = marketState.connectionStatus;
    // Faster fallback (3s) when WS is not connected
    const baseInterval = (settings.marketDataInterval || 10) * 1000;
    const intervalMs = wsStatus === "connected" ? baseInterval : 3000;

    priceUpdateIntervalId = setInterval(() => {
      const currentSymbol = tradeState.symbol;

      if (
        currentSymbol &&
        currentSymbol.length >= 3 &&
        !uiState.isPriceFetching
      ) {
        if (settings.autoUpdatePriceInput) {
          if (settings.apiProvider === "binance") {
            app.handleFetchPrice(true);
          } else {
            const wsStatus = marketState.connectionStatus;
            if (wsStatus !== "connected") {
              app.handleFetchPrice(true);
            }
          }
        }

        if (tradeState.useAtrSl && tradeState.atrMode === "auto") {
          app.fetchAtr(true);
        }
      }
    }, intervalMs);
  },

  calculateAndDisplay: () => {
    calculatorService.calculateAndDisplay();
  },

  clearResults: (showGuidance = false) => {
    calculatorService.clearResults(showGuidance);
  },

  getJournal: (): JournalEntry[] => {
    if (!browser) return [];
    // Optimisation: Read from store memory instead of parsing localStorage on every call
    // This dramatically reduces I/O blocking on main thread for large datasets
    const fromStore = journalState.entries;
    if (fromStore && fromStore.length > 0) {
      return fromStore;
    }

    // Fallback: Initial Load or Empty Store
    try {
      const d =
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
      const parsedData = JSON.parse(d);
      if (!Array.isArray(parsedData)) return [];
      return parsedData.map((trade) => normalizeJournalEntry(trade));
    } catch {
      console.warn("Could not load journal from localStorage.");
      uiState.showError("Journal konnte nicht geladen werden.");
      return [];
    }
  },
  saveJournal: (d: JournalEntry[]) => {
    if (!browser) return;
    try {
      const jsonData = JSON.stringify(d);
      // P0 Fix: Use safe storage with quota checking
      storageUtils.safeSetItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, jsonData);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern des Journals. Der lokale Speicher ist möglicherweise voll oder blockiert.";
      uiState.showError(message);

      // Log quota status for debugging
      const quota = storageUtils.checkQuota();
      console.error("LocalStorage Status:", quota);
    }
  },
  addTrade: () => {
    const currentAppState = tradeState;
    if (
      !currentAppState.currentTradeData ||
      !currentAppState.currentTradeData.positionSize ||
      currentAppState.currentTradeData.positionSize.lte(0)
    ) {
      uiState.showError("Kann keinen ungültigen Trade speichern.");
      return;
    }
    const journalData = app.getJournal();

    const newTrade: JournalEntry = {
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

    // Track meaningful user action: adding a trade to journal
    const activeTargets =
      currentAppState.currentTradeData.targets?.filter(
        (t: any) =>
          t.price &&
          parseDecimal(t.price).gt(0) &&
          t.percent &&
          parseDecimal(t.percent).gt(0),
      ).length || 0;
    trackCustomEvent(
      "Journal",
      "AddTrade",
      currentAppState.tradeType,
      activeTargets,
    );

    onboardingService.trackFirstJournalSave();
    uiState.showFeedback("save");
  },
  updateTradeStatus: (id: number, newStatus: string) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex((t) => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex].status = newStatus;
      app.saveJournal(journalData);
      journalState.set(journalData);
      trackCustomEvent("Journal", "UpdateStatus", newStatus);
    }
  },
  updateTrade: (id: number, updates: Partial<JournalEntry>) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex((t) => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex] = { ...journalData[tradeIndex], ...updates };
      app.saveJournal(journalData);
      journalState.set(journalData);
    }
  },
  deleteTrade: (id: number) => {
    const d = app.getJournal().filter((t) => t.id != id);
    app.saveJournal(d);
    journalState.set(d);
    trackCustomEvent("Journal", "DeleteTrade");
  },
  async clearJournal() {
    const journal = app.getJournal();
    if (journal.length === 0) {
      uiState.showError("Das Journal ist bereits leer.");
      return;
    }
    if (
      await modalManager.show(
        "Journal leeren",
        "Möchten Sie wirklich das gesamte Journal unwiderruflich löschen?",
        "confirm",
      )
    ) {
      app.saveJournal([]);
      journalState.set([]);
      uiState.showFeedback("save", 2000);
    }
  },

  getInputsAsObject: () => {
    const currentAppState = tradeState;
    return {
      accountSize: currentAppState.accountSize,
      riskPercentage: currentAppState.riskPercentage,
      leverage: currentAppState.leverage,
      fees: currentAppState.fees,
      tradeType: currentAppState.tradeType,
      useAtrSl: currentAppState.useAtrSl,
      atrMultiplier: currentAppState.atrMultiplier,
      symbol: currentAppState.symbol,
      targets: currentAppState.targets,
      tags: currentAppState.tags,
    };
  },
  savePreset: async () => {
    if (!browser) return;
    const presetName = await modalManager.show(
      "Preset speichern",
      "Geben Sie einen Namen für Ihr Preset ein:",
      "prompt",
    );
    if (typeof presetName === "string" && presetName) {
      try {
        const presets = JSON.parse(
          localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}",
        );
        if (
          presets[presetName] &&
          !(await modalManager.show(
            "Überschreiben?",
            `Preset "${presetName}" existiert bereits. Möchten Sie es überschreiben?`,
            "confirm",
          ))
        )
          return;
        presets[presetName] = app.getInputsAsObject();
        localStorage.setItem(
          CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
          JSON.stringify(presets),
        );
        trackCustomEvent("Presets", "Save", presetName);
        uiState.showFeedback("save");
        app.populatePresetLoader();
        presetState.selectedPreset = presetName;
      } catch {
        uiState.showError(
          "Preset konnte nicht gespeichert werden. Der lokale Speicher ist möglicherweise voll oder blockiert.",
        );
      }
    }
  },
  deletePreset: async () => {
    if (!browser) return;
    const presetName = presetState.selectedPreset;
    if (!presetName) return;
    if (
      !(await modalManager.show(
        "Preset löschen",
        `Preset "${presetName}" wirklich löschen?`,
        "confirm",
      ))
    )
      return;
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}",
      );
      delete presets[presetName];
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
        JSON.stringify(presets),
      );
      trackCustomEvent("Presets", "Delete", presetName);
      app.populatePresetLoader();
      presetState.selectedPreset = "";
    } catch {
      uiState.showError("Preset konnte nicht gelöscht werden.");
    }
  },
  loadPreset: (presetName: string) => {
    if (!browser) return;
    if (!presetName) return;
    trackCustomEvent("Preset", "Load", presetName);
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}",
      );
      const preset = presets[presetName];
      if (preset) {
        tradeState.resetInputs(true); // Assuming resetInputs exists
        tradeState.update(state => ({
          ...state,
          accountSize: preset.accountSize || null,
          riskPercentage: preset.riskPercentage || null,
          leverage: preset.leverage || parseFloat(CONSTANTS.DEFAULT_LEVERAGE),
          fees: preset.fees || parseFloat(CONSTANTS.DEFAULT_FEES),
          symbol: preset.symbol || "",
          atrValue: preset.atrValue || null,
          atrMultiplier:
            preset.atrMultiplier ||
            parseFloat(CONSTANTS.DEFAULT_ATR_MULTIPLIER),
          useAtrSl: preset.useAtrSl || false,
          tradeType: preset.tradeType || CONSTANTS.TRADE_TYPE_LONG,
          tags: preset.tags || [],
          targets: preset.targets || [
            { price: null, percent: 50, isLocked: false },
            { price: null, percent: 25, isLocked: false },
            { price: null, percent: 25, isLocked: false },
          ],
        }));
        presetState.selectedPreset = presetName;
        // toggleAtrInputs(preset.useAtrSl || false); // Moved to update logic or direct assignment
        // Since useAtrSl is updated in tradeState above, we just need to ensure side-effects if any?
        if (preset.useAtrSl) tradeState.atrMode = "auto";

        return;
      }
    } catch (error) {
      console.error("Fehler beim Laden des Presets:", error);
      uiState.showError("Preset konnte nicht geladen werden.");
    }
  },
  populatePresetLoader: () => {
    if (!browser) return;
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}",
      );
      const presetNames = Object.keys(presets);
      presetState.availablePresets = presetNames;
    } catch {
      console.warn("Could not populate presets from localStorage.");
      presetState.availablePresets = [];
    }
  },
  exportToCSV: () => {
    if (!browser) return;
    const journalData = journalState.entries;
    if (journalData.length === 0) {
      uiState.showError("Journal ist leer.");
      return;
    }

    try {
      const csvContent = csvService.generateCSV(journalData);

      const link = document.createElement("a");
      link.href = encodeURI(csvContent);
      link.download = "TradeJournal.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      trackCustomEvent("Journal", "Export", "CSV", journalData.length);
    } catch (e) {
      uiState.showError("Fehler beim Erstellen der CSV-Datei.");
      console.error(e);
    }
  },
  syncBitunixHistory: async () => {
    await syncService.syncBitunixPositions();
  },
  importFromCSV: (file: File) => {
    if (!browser) return;

    // P0 Fix: File size validation
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      uiState.showError(
        `Die CSV-Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(
          1,
        )}MB). ` + `Maximum: 5MB. Bitte teilen Sie die Datei auf.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;

      try {
        const entries = csvService.parseCSVContent(text);

        if (entries.length > 0) {
          const currentJournal = journalState.entries;
          const combined = [...currentJournal, ...entries];
          const unique = Array.from(
            new Map(combined.map((trade) => [trade.id, trade])).values(),
          );

          if (
            await modalManager.show(
              "Import bestätigen",
              `Sie sind dabei, ${entries.length} Trades zu importieren. Bestehende Trades mit derselben ID werden überschrieben. Fortfahren?`,
              "confirm",
            )
          ) {
            journalState.set(unique);
            trackCustomEvent("Journal", "Import", "CSV", entries.length);
            uiState.showFeedback("save", 2000);
          }
        } else {
          uiState.showError(
            "Keine gültigen Einträge in der CSV-Datei gefunden.",
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        uiState.showError(message);
        console.error("CSV Import Error:", error);
      }
    };
    reader.readAsText(file);
  },

  handleFetchPrice: async (isAuto = false) => {
    const currentTradeState = tradeState;
    const settings = settingsState;
    const symbol = currentTradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) {
      if (!isAuto) uiState.showError("Bitte geben Sie ein Symbol ein.");
      return;
    }

    if (!isAuto)
      uiState.update((state) => ({ ...state, isPriceFetching: true }));

    try {
      let price: Decimal;
      if (settings.apiProvider === "binance") {
        price = await apiService.fetchBinancePrice(symbol);
      } else {
        price = await apiService.fetchBitunixPrice(symbol);
      }

      app.currentMarketPrice = price;

      tradeState.update(s => ({
        ...s,
        entryPrice: price.toDP(4).toNumber()
      }));

      if (!isAuto) {
        trackCustomEvent("API", "FetchPrice", symbol);
        uiState.showFeedback("save", 700);
      }

      app.calculateAndDisplay();
    } catch (error) {
      if (!isAuto) {
        const message = error instanceof Error ? error.message : String(error);
        uiState.showError(message);
      }
    } finally {
      if (!isAuto)
        uiState.update((state) => ({ ...state, isPriceFetching: false }));
    }
  },

  setAtrMode: (mode: "manual" | "auto") => {
    tradeState.update((state) => ({
      ...state,
      atrMode: mode,
      atrValue: mode === "auto" ? null : state.atrValue,
    }));
    if (mode === "auto") {
      app.fetchAtr();
    }
    app.calculateAndDisplay();
  },

  setAtrTimeframe: (timeframe: string) => {
    tradeState.update((state) => ({
      ...state,
      atrTimeframe: timeframe,
    }));
    if (tradeState.atrMode === "auto") {
      app.fetchAtr();
    }
  },

  fetchAtr: async (isAuto = false) => {
    const currentTradeState = tradeState;
    const settings = settingsState;
    const symbol = currentTradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) {
      if (!isAuto) uiState.showError("Bitte geben Sie ein Symbol ein.");
      return;
    }

    if (!isAuto) uiState.update((state) => ({ ...state, isAtrFetching: true }));

    try {
      let klines;
      if (settings.apiProvider === "binance") {
        klines = await apiService.fetchBinanceKlines(
          symbol,
          currentTradeState.atrTimeframe,
          15,
          "high",
        );
      } else {
        klines = await apiService.fetchBitunixKlines(
          symbol,
          currentTradeState.atrTimeframe,
          15,
          undefined,
          undefined,
          "high",
        );
      }

      const atr = calculator.calculateATR(klines);
      if (atr.lte(0)) {
        throw new Error(
          "ATR konnte nicht berechnet werden. Prüfen Sie das Symbol oder den Zeitrahmen.",
        );
      }
      tradeState.update((state) => ({
        ...state,
        atrValue: atr.toDP(4).toNumber(),
      }));
      app.calculateAndDisplay();

      if (!isAuto) {
        trackCustomEvent(
          "API",
          "FetchATR",
          `${symbol}/${currentTradeState.atrTimeframe}`,
        );
        uiState.showFeedback("save", 700);
      }
    } catch (error) {
      if (!isAuto) {
        const message = error instanceof Error ? error.message : String(error);
        uiState.showError(message);
      }
    } finally {
      if (!isAuto)
        uiState.update((state) => ({ ...state, isAtrFetching: false }));
    }
  },

  selectSymbolSuggestion: (symbol: string) => {
    tradeState.update(s => ({ ...s, symbol }));
    uiState.update((s) => ({
      ...s,
      showSymbolSuggestions: false,
      symbolSuggestions: [],
    }));

    app.handleFetchPrice();
    if (tradeState.useAtrSl && tradeState.atrMode === "auto") {
      app.fetchAtr();
    }
  },

  updateSymbolSuggestions: (query: string) => {
    const upperQuery = query.toUpperCase().replace("/", "");
    let filtered: string[] = [];
    if (upperQuery) {
      filtered = CONSTANTS.SUGGESTED_SYMBOLS.filter((s) =>
        s.startsWith(upperQuery),
      );
    }
    uiState.update((s) => ({
      ...s,
      symbolSuggestions: filtered,
      showSymbolSuggestions: filtered.length > 0,
    }));
  },
  togglePositionSizeLock: (forceState?: boolean) => {
    const currentTradeState = tradeState;
    const currentResultsState = resultsState;
    const shouldBeLocked =
      forceState !== undefined
        ? forceState
        : !currentTradeState.isPositionSizeLocked;

    if (
      shouldBeLocked &&
      (!currentResultsState.positionSize ||
        parseDecimal(currentResultsState.positionSize).lte(0))
    ) {
      uiState.showError(
        "Positionsgröße kann nicht gesperrt werden, solange sie ungültig ist.",
      );
      return;
    }

    tradeState.update((state) => ({
      ...state,
      isPositionSizeLocked: shouldBeLocked,
      lockedPositionSize: shouldBeLocked
        ? parseDecimal(currentResultsState.positionSize)
        : null,
      isRiskAmountLocked: false,
    }));

    app.calculateAndDisplay();
  },

  toggleRiskAmountLock: (forceState?: boolean) => {
    const currentTradeState = tradeState;
    const shouldBeLocked =
      forceState !== undefined
        ? forceState
        : !currentTradeState.isRiskAmountLocked;

    tradeState.update(state => ({
      ...state,
      isRiskAmountLocked: shouldBeLocked,
      // If locking, ensure riskAmount is synced with current calculations? 
      // Typically riskAmount is calculated.
      isPositionSizeLocked: false // Mutually exclusive
    }));

    // If we just locked it, we might want to ensure the current risk amount calculation is the seed?
    // For now, assume state update triggers reactivity or calculate handles it.
    app.calculateAndDisplay();
  },

  addTakeProfitRow: (
    price: number | null = null,
    percent: number | null = null,
    isLocked = false,
  ) => {
    tradeState.update(state => ({
      ...state,
      targets: [...state.targets, { price, percent, isLocked }]
    }));
  },

  removeTakeProfitRow: (index: number) => {
    tradeState.update(state => {
      const newTargets = [...state.targets];
      newTargets.splice(index, 1);
      return { ...state, targets: newTargets };
    });
    // Re-adjust percentages after removal?
    app.adjustTpPercentages(null);
  },

  fetchAllAnalysisData: async (symbol: string, isAuto = false) => {
    if (!symbol || symbol.length < 3) return;

    app.handleFetchPrice(isAuto);

    const state = tradeState;
    const settings = settingsState;
    const currentTf = state.atrTimeframe;

    try {
      let klines;
      if (settings.apiProvider === "binance") {
        klines = await apiService.fetchBinanceKlines(
          symbol,
          currentTf,
          99,
          "high",
        );
      } else {
        klines = await apiService.fetchBitunixKlines(
          symbol,
          currentTf,
          99,
          undefined,
          undefined,
          "high",
        );
      }

      const atr = calculator.calculateATR(klines);
      if (atr.gt(0)) {
        tradeState.atrValue = atr.toDP(4).toNumber();

        if (state.useAtrSl && state.atrMode === "auto") {
          app.calculateAndDisplay();
        }
      }
      if (!isAuto) uiState.showFeedback("save", 700);
    } catch (e: any) {
      if (e.message !== "apiErrors.symbolNotFound") {
        console.warn(`Failed to load Current ATR ${currentTf}`, e);
      }
    }
  },

  adjustTpPercentages: (changedIndex: number | null) => {
    const currentAppState = tradeState;
    if (
      changedIndex !== null &&
      currentAppState.targets[changedIndex] &&
      currentAppState.targets[changedIndex].isLocked
    ) {
      return;
    }

    const targets = JSON.parse(JSON.stringify(currentAppState.targets));

    // Parse values to integers (since UI enforces noDecimals)
    const items = targets.map((t: any, i: number) => ({
      ...t,
      percent: Math.round(Number(t.percent) || 0),
      index: i,
    }));

    const ONE_HUNDRED = 100;
    const changedItem = changedIndex !== null ? items[changedIndex] : null;

    // 1. Calculate Reserved Sum (Locked Items + Changed Item)
    // If changedIndex is null (e.g. from add/remove row), changedItem is null.
    // Then we treat all unlocked as "Others".

    let lockedSum = 0;
    items.forEach((t: any) => {
      if (t.isLocked && t.index !== changedIndex) {
        lockedSum += t.percent;
      }
    });

    // 2. Handle Overflow of Changed Item itself
    if (changedItem) {
      if (lockedSum + changedItem.percent > ONE_HUNDRED) {
        // Cap the changed item if it violates 100% with locked items
        changedItem.percent = Math.max(0, ONE_HUNDRED - lockedSum);
      }
    }

    const currentUsed = lockedSum + (changedItem ? changedItem.percent : 0);
    const availableForOthers = ONE_HUNDRED - currentUsed;

    // 3. Identification of "Others" (Unlocked and not the one being edited)
    const others = items.filter(
      (t: any) => !t.isLocked && t.index !== changedIndex,
    );

    if (others.length > 0) {
      // Current sum of others before adjustment
      const currentOthersSum = others.reduce(
        (acc: number, t: any) => acc + t.percent,
        0,
      );

      // The amount others SHOULD sum up to
      const targetOthersSum = availableForOthers;
      const diff = targetOthersSum - currentOthersSum;

      if (diff === 0) {
        // No adjustment needed
      } else if (diff > 0) {
        // Surplus: We released percentage (e.g. decreased the edited TP).
        // Distribute diff evenly among others.
        const count = others.length;
        const share = Math.floor(diff / count);
        let remainder = diff % count;

        others.forEach((t: any) => {
          t.percent += share + (remainder > 0 ? 1 : 0);
          remainder--;
        });
      } else {
        // Deficit: We increased the edited TP.
        // We need to subtract abs(diff) from others.
        // Strategy: Subtract from last to first (Reverse Order) as per requirement/convention
        // to avoid touching the first TPs if possible.
        let amountToRemove = Math.abs(diff);

        // Iterate reversed
        for (let i = others.length - 1; i >= 0; i--) {
          const t = others[i];
          const canTake = t.percent; // We can take down to 0
          const take = Math.min(amountToRemove, canTake);
          t.percent -= take;
          amountToRemove -= take;
          if (amountToRemove <= 0) break;
        }
      }
    } else {
      // No others to distribute to.
      // If we are in a scenario where all other items are locked,
      // this single unlocked item is implicitly locked to the remainder of 100%.
      // We enforce this to maintain the 100% total invariant, preventing
      // accidental underflows when the user has locked everything else.
      if (changedItem) {
        changedItem.percent = Math.max(0, ONE_HUNDRED - lockedSum);
      }
    }

    tradeState.targets = items.map((t: any) => ({
      price: t.price,
      percent: t.percent,
      isLocked: t.isLocked,
    }));
  },
};

