/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// Stores
import { get } from "svelte/store";

import { tradeState } from "../stores/trade.svelte";
import { resultsState } from "../stores/results.svelte";
import { presetState } from "../stores/preset.svelte";
import { journalState } from "../stores/journal.svelte";
import { uiState } from "../stores/ui.svelte";
import { settingsState } from "../stores/settings.svelte";
import { CalculatorService } from "./calculatorService";
import { exchangeAdapters } from "./exchange";
import { favoritesState } from "../stores/favorites.svelte";
import { marketState } from "../stores/market.svelte";
import { normalizeSymbol } from "../utils/symbolUtils";
import { _ } from "../locales/i18n";
import { syncService } from "./syncService";
import { csvService } from "./csvService";
import { apiService } from "./apiService";
import { tradeService } from "./tradeService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";
import { APP_VERSION } from "../lib/version";
import { modalState } from "../stores/modal.svelte";
import { parseDecimal } from "../utils/utils";
import { safeJsonParse } from "../utils/safeJson";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { addContextProvider, initTracking } from "./trackingService";
import { marketWatcher } from "./marketWatcher";
import { connectionManager } from "./connectionManager";
import { tradeCalculator } from "./tradeCalculator.svelte";
import { marketAnalyst } from "./marketAnalyst";
import { logger } from "./logger";
import { setupRealtimeUpdatesEffect } from "./appEffects.svelte";
import { rmsService } from "./rmsService";
import { paperTradingService } from "./paperTradingService";
import { orderAuditService } from "./orderAuditService";

const calculatorService = new CalculatorService(calculator, uiState);

let realtimeUpdatesCleanup: (() => void) | null = null;
let isInitialized = false;

export const app = {
  calculator: calculator,
  uiManager: uiState,
  currentMarketPrice: null as Decimal | null,

  init: () => {
    if (browser) {
      if (isInitialized) return;
      isInitialized = true;

      // 0. Setup Tracking Context
      // BUG-0286: the currently viewed pair is user context and must not be
      // part of the default telemetry dimensions (guarded by test).
      addContextProvider(() => {
        return {
          app_theme: uiState.currentTheme,
          app_provider: settingsState.apiProvider,
          app_background: settingsState.backgroundType,
          app_modals: uiState.windows.map((w) => w.id).join(","),
          app_viewport: `${window.innerWidth}x${window.innerHeight}`,
          app_zoom: window.devicePixelRatio,
          app_version: APP_VERSION,
        };
      });
      // Telemetry is opt-out (BUG-0286): tracking runs by default and
      // initTracking() injects the container unless the user disabled it
      // under Settings > System > Performance ("Usage Statistics").
      initTracking();

      // 1. Initialise core logic
      // Risk limits and the kill switch (FEAT-0013) must be attached to the
      // order gate before anything can place an order — unregistered hooks
      // mean the gate approves on those two checks.
      rmsService.installGateHooks();
      // FEAT-0012: points the simulator at the live feed and mirrors the
      // paper book into the shared stores. No-op while paper mode is off.
      paperTradingService.install();
      // FEAT-0015: attaches the audit recorder to the gate. Until it runs
      // nothing is recorded, so this is not optional wiring either.
      orderAuditService.install();
      app.populatePresetLoader();
      app.setupMarketSync();
      tradeCalculator.init(() => app.calculateAndDisplay());

      // 2. Register dependencies in ConnectionManager
      // FEAT-0227: every adapter hands over its own socket, so adding a venue
      // is a registry entry rather than two more lines here.
      for (const adapter of exchangeAdapters) {
        connectionManager.registerProvider(adapter.id, adapter.connection);
      }
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
        atrMultiplier: "1.2",
        useAtrSl: true,
        atrMode: "auto",
        targets: [
          { price: "120000", percent: "50", isLocked: false },
          { price: "122000", percent: "25", isLocked: false },
          { price: "124000", percent: "25", isLocked: false },
        ],
      }));

      // Settings for visibility
      settingsState.showMarketActivity = true; // Show details in tiles
      settingsState.showSidebarActivity = true; // Show sidebar activity (Positions & Orders)
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

    if (realtimeUpdatesCleanup) {
      realtimeUpdatesCleanup();
      realtimeUpdatesCleanup = null;
    }

    realtimeUpdatesCleanup = setupRealtimeUpdatesEffect(app);
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

  addTrade: async () => {
    const currentAppState = tradeState;
    if (!currentAppState.currentTradeData?.positionSize?.gt(0)) {
      uiState.showError("errors.invalidTrade");
      return;
    }
    const newTrade = {
      ...currentAppState.currentTradeData,
      notes: currentAppState.tradeNotes,
      tags: currentAppState.tags || [],
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      entryDate: new Date().toISOString(),
    } as JournalEntry;

    const added = journalState.addEntry(newTrade);
    if (added) {
      uiState.showFeedback("save");
    }
  },

  updateTradeStatus: async (id: number | string, newStatus: string) => {
    const trade = journalState.entries.find((t) => String(t.id) === String(id));
    if (trade) {
      journalState.updateEntry({ ...trade, status: newStatus });
    }
  },

  updateTrade: async (id: number | string, updates: Partial<JournalEntry>) => {
    const trade = journalState.entries.find((t) => String(t.id) === String(id));
    if (trade) {
      journalState.updateEntry({ ...trade, ...updates });
    }
  },

  deleteTrade: async (id: number | string) => {
    journalState.deleteEntry(id);
  },

  async clearJournal() {
    const confirmed = await modalState.show(
      "modals.clearJournal.title",
      "modals.clearJournal.message",
      "confirm",
    );
    if (confirmed) {
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
      // Ensure strings for legacy presets — the trade state holds these as
      // strings only, and presets written by earlier versions may carry numbers.
      const legacyNumericFields = [
        "accountSize",
        "riskPercentage",
        "entryPrice",
        "stopLossPrice",
        "leverage",
        "fees",
        "atrValue",
        "atrMultiplier",
        "riskAmount",
      ] as const;
      for (const field of legacyNumericFields) {
        if (typeof p[field] === "number") p[field] = String(p[field]);
      }
      if (Array.isArray(p.targets)) {
        for (const t of p.targets) {
          if (typeof t?.price === "number") t.price = String(t.price);
          if (typeof t?.percent === "number") t.percent = String(t.percent);
        }
      }

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
      logger.debug("api", `[handleFetchPrice] Fetching price for ${symbol} via ${settingsState.apiProvider}`);
      const ticker = await apiService.fetchTicker24h(
        symbol,
        settingsState.apiProvider,
      );
      logger.debug("api", `[handleFetchPrice] Fetched ticker:`, ticker);
      const priceVal = ticker.lastPrice;

      const meta = marketState.symbolMeta[normalizeSymbol(symbol, "bitunix")];
      let decPrice = new Decimal(priceVal);
      if (meta?.quotePrecision !== undefined) {
        decPrice = decPrice.toDecimalPlaces(meta.quotePrecision, Decimal.ROUND_HALF_UP);
      }

      app.currentMarketPrice = decPrice;
      tradeState.update((s) => ({ ...s, entryPrice: decPrice.toString() }));
      app.calculateAndDisplay();
    } catch {
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
    } catch {
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
    if (currentTargets.length >= 4) return;

    const newTargets = [
      ...currentTargets,
      { price: null, percent: "0", isLocked: false },
    ];
    tradeState.update((s) => ({ ...s, targets: newTargets }));
    app.adjustTpPercentages(null);
  },

  removeTakeProfitRow(index: number) {
    if (index === 0) return;
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

    // Read-only Bitunix metadata for the trade panel (leverage/margin-mode,
    // trading-pair limits, position tiers). Not on the critical path for
    // price/ATR, so fire-and-forget — each fetch fails silently and leaves
    // its store slice unset, which every consumer already renders as "-".
    const activeSymbol = symbol || tradeState.symbol;
    if (activeSymbol) {
      tradeService.fetchLeverageMarginMode(activeSymbol);
      tradeService.fetchTradingPairInfo(activeSymbol);
      tradeService.fetchPositionTiers(activeSymbol);
    }
  },
};
