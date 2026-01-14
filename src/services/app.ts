import { get } from "svelte/store";
import {
  parseDecimal,
  formatDynamicDecimal,
  parseDateString,
  parseTimestamp,
  normalizeJournalEntry,
} from "../utils/utils";
import { CONSTANTS } from "../lib/constants";
import { apiService } from "./apiService";
import { modalManager } from "./modalManager";
import { uiManager } from "./uiManager";
import { calculator } from "../lib/calculator";
import {
  tradeStore,
  updateTradeStore,
  resetAllInputs,
  toggleAtrInputs,
} from "../stores/tradeStore";
import { resultsStore, initialResultsState } from "../stores/resultsStore";
import { presetStore, updatePresetStore } from "../stores/presetStore";
import { journalStore } from "../stores/journalStore";
import { uiStore } from "../stores/uiStore";
import { settingsStore } from "../stores/settingsStore";
import { CalculatorService } from "./calculatorService";
import { marketStore, wsStatusStore } from "../stores/marketStore"; // Import marketStore and wsStatusStore
import { bitunixWs } from "./bitunixWs"; // Import WS Service
import { syncService } from "./syncService";
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
  resultsStore,
  tradeStore,
  uiStore,
  initialResultsState,
  updateTradeStore
);

export const app = {
  calculator: calculator,
  uiManager: uiManager,

  init: () => {
    if (browser) {
      app.populatePresetLoader();
      app.calculateAndDisplay();
      app.setupPriceUpdates();
      app.setupRealtimeUpdates(); // Initialize WS updates
    }
  },

  setupRealtimeUpdates: () => {
    if (!browser) return;

    // Cleanup existing subscription to prevent leaks/duplicates
    if (tradeStoreUnsubscribe) {
      tradeStoreUnsubscribe();
      tradeStoreUnsubscribe = null;
    }

    // Watch for symbol changes to manage MarketWatcher registrations
    let currentWatchedSymbol: string | null = null;
    let symbolDebounceTimer: any = null;

    tradeStoreUnsubscribe = tradeStore.subscribe((state) => {
      const newSymbol = state.symbol ? normalizeSymbol(state.symbol, "bitunix") : "";

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
    marketStoreUnsubscribe = marketStore.subscribe((data) => {
      const state = get(tradeStore);
      const settings = get(settingsStore);

      if (state.symbol && settings.autoUpdatePriceInput) {
        const normSymbol = normalizeSymbol(state.symbol, "bitunix");
        const marketData = data[normSymbol];

        if (marketData && marketData.lastPrice) {
          const newPrice = marketData.lastPrice.toNumber();
          if (state.entryPrice !== newPrice) {
            updateTradeStore((s) => ({ ...s, entryPrice: newPrice }));

            const now = Date.now();
            if (now - lastCalculationTime > CALCULATION_THROTTLE_MS) {
              app.calculateAndDisplay();
              lastCalculationTime = now;
            }
          }
        }
      }
    });
  },

  setupPriceUpdates: () => {
    if (!browser) return;

    // Watch settings and symbol changes to adjust interval
    settingsStore.subscribe(() => app.refreshPriceUpdateInterval());

    // Initial setup
    app.refreshPriceUpdateInterval();
  },

  refreshPriceUpdateInterval: () => {
    if (priceUpdateIntervalId) {
      clearInterval(priceUpdateIntervalId);
      priceUpdateIntervalId = null;
    }

    const settings = get(settingsStore);
    const intervalMs = (settings.marketDataInterval || 10) * 1000;

    priceUpdateIntervalId = setInterval(() => {
      const currentSymbol = get(tradeStore).symbol;
      const uiState = get(uiStore);

      if (currentSymbol && currentSymbol.length >= 3 && !uiState.isPriceFetching) {
        if (settings.autoUpdatePriceInput) {
          if (settings.apiProvider === "binance") {
            app.handleFetchPrice(true);
          } else {
            const wsStatus = get(wsStatusStore);
            if (wsStatus !== "connected") {
              app.handleFetchPrice(true);
            }
          }
        }

        if (get(tradeStore).useAtrSl && get(tradeStore).atrMode === "auto") {
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
    const fromStore = get(journalStore);
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
      uiStore.showError("Journal konnte nicht geladen werden.");
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
      uiStore.showError(message);

      // Log quota status for debugging
      const quota = storageUtils.checkQuota();
      console.error("LocalStorage Status:", quota);
    }
  },
  addTrade: () => {
    const currentAppState = get(tradeStore);
    if (
      !currentAppState.currentTradeData ||
      !currentAppState.currentTradeData.positionSize ||
      currentAppState.currentTradeData.positionSize.lte(0)
    ) {
      uiStore.showError("Kann keinen ungültigen Trade speichern.");
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
    journalStore.set(journalData);
    onboardingService.trackFirstJournalSave();
    uiStore.showFeedback("save");
  },
  updateTradeStatus: (id: number, newStatus: string) => {
    const journalData = app.getJournal();
    const tradeIndex = journalData.findIndex((t) => t.id == id);
    if (tradeIndex !== -1) {
      journalData[tradeIndex].status = newStatus;
      app.saveJournal(journalData);
      journalStore.set(journalData);
      trackCustomEvent("Journal", "UpdateStatus", newStatus);
    }
  },
  deleteTrade: (id: number) => {
    const d = app.getJournal().filter((t) => t.id != id);
    app.saveJournal(d);
    journalStore.set(d);
  },
  async clearJournal() {
    const journal = app.getJournal();
    if (journal.length === 0) {
      uiStore.showError("Das Journal ist bereits leer.");
      return;
    }
    if (
      await modalManager.show(
        "Journal leeren",
        "Möchten Sie wirklich das gesamte Journal unwiderruflich löschen?",
        "confirm"
      )
    ) {
      app.saveJournal([]);
      journalStore.set([]);
      uiStore.showFeedback("save", 2000);
    }
  },

  getInputsAsObject: () => {
    const currentAppState = get(tradeStore);
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
      "prompt"
    );
    if (typeof presetName === "string" && presetName) {
      try {
        const presets = JSON.parse(
          localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
        );
        if (
          presets[presetName] &&
          !(await modalManager.show(
            "Überschreiben?",
            `Preset "${presetName}" existiert bereits. Möchten Sie es überschreiben?`,
            "confirm"
          ))
        )
          return;
        presets[presetName] = app.getInputsAsObject();
        localStorage.setItem(
          CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
          JSON.stringify(presets)
        );
        uiStore.showFeedback("save");
        app.populatePresetLoader();
        updatePresetStore((state) => ({
          ...state,
          selectedPreset: presetName,
        }));
      } catch {
        uiStore.showError(
          "Preset konnte nicht gespeichert werden. Der lokale Speicher ist möglicherweise voll oder blockiert."
        );
      }
    }
  },
  deletePreset: async () => {
    if (!browser) return;
    const presetName = get(presetStore).selectedPreset;
    if (!presetName) return;
    if (
      !(await modalManager.show(
        "Preset löschen",
        `Preset "${presetName}" wirklich löschen?`,
        "confirm"
      ))
    )
      return;
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
      );
      delete presets[presetName];
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
        JSON.stringify(presets)
      );
      app.populatePresetLoader();
      updatePresetStore((state) => ({ ...state, selectedPreset: "" }));
    } catch {
      uiStore.showError("Preset konnte nicht gelöscht werden.");
    }
  },
  loadPreset: (presetName: string) => {
    if (!browser) return;
    if (!presetName) return;
    trackCustomEvent("Preset", "Load", presetName);
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
      );
      const preset = presets[presetName];
      if (preset) {
        resetAllInputs();
        updateTradeStore((state) => ({
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
        updatePresetStore((state) => ({
          ...state,
          selectedPreset: presetName,
        }));
        toggleAtrInputs(preset.useAtrSl || false);
        return;
      }
    } catch (error) {
      console.error("Fehler beim Laden des Presets:", error);
      uiStore.showError("Preset konnte nicht geladen werden.");
    }
  },
  populatePresetLoader: () => {
    if (!browser) return;
    try {
      const presets = JSON.parse(
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY) || "{}"
      );
      const presetNames = Object.keys(presets);
      updatePresetStore((state) => ({
        ...state,
        availablePresets: presetNames,
      }));
    } catch {
      console.warn("Could not populate presets from localStorage.");
      updatePresetStore((state) => ({ ...state, availablePresets: [] }));
    }
  },
  exportToCSV: () => {
    if (!browser) return;
    const journalData = get(journalStore);
    if (journalData.length === 0) {
      uiStore.showError("Journal ist leer.");
      return;
    }
    trackCustomEvent("Journal", "Export", "CSV", journalData.length);
    const headers = [
      "ID",
      "Datum",
      "Uhrzeit",
      "Symbol",
      "Typ",
      "Status",
      "Konto Guthaben",
      "Risiko %",
      "Hebel",
      "Gebuehren %",
      "Einstieg",
      "Exit",
      "MAE",
      "MFE",
      "Efficiency",
      "Stop Loss",
      "Gewichtetes R/R",
      "Gesamt Netto-Gewinn",
      "Risiko pro Trade (Waehrung)",
      "Gesamte Gebuehren",
      "Max. potenzieller Gewinn",
      "Notizen",
      "Tags",
      "Screenshot",
      // New headers
      "Trade ID",
      "Order ID",
      "Funding Fee",
      "Trading Fee",
      "Realized PnL",
      "Is Manual",
      "Entry Date",
      ...Array.from({ length: 5 }, (_, i) => [
        `TP${i + 1} Preis`,
        `TP${i + 1} %`,
      ]).flat(),
    ];
    const rows = journalData.map((trade) => {
      const date = new Date(trade.date);
      const notes = trade.notes
        ? `"${trade.notes.replace(/"/g, '""').replace(/\n/g, " ")}"`
        : "";
      const tags =
        trade.tags && trade.tags.length > 0 ? `"${trade.tags.join(";")}"` : "";
      const screenshot = trade.screenshot || "";
      const tpData = Array.from({ length: 5 }, (_, i) => [
        (trade.targets[i]?.price || new Decimal(0)).toFixed(4),
        (trade.targets[i]?.percent || new Decimal(0)).toFixed(2),
      ]).flat();
      return [
        trade.id,
        date.toLocaleDateString("de-DE"),
        date.toLocaleTimeString("de-DE"),
        trade.symbol,
        trade.tradeType,
        trade.status,
        (trade.accountSize || new Decimal(0)).toFixed(2),
        (trade.riskPercentage || new Decimal(0)).toFixed(2),
        (trade.leverage || new Decimal(0)).toFixed(2),
        (trade.fees || new Decimal(0)).toFixed(2),
        (trade.entryPrice || new Decimal(0)).toFixed(4),
        trade.exitPrice ? trade.exitPrice.toFixed(4) : "",
        trade.mae ? trade.mae.toFixed(4) : "",
        trade.mfe ? trade.mfe.toFixed(4) : "",
        trade.efficiency ? trade.efficiency.toFixed(2) : "",
        (trade.stopLossPrice || new Decimal(0)).toFixed(4),
        (trade.totalRR || new Decimal(0)).toFixed(2),
        (trade.totalNetProfit || new Decimal(0)).toFixed(2),
        (trade.riskAmount || new Decimal(0)).toFixed(2),
        (trade.totalFees || new Decimal(0)).toFixed(2),
        (trade.maxPotentialProfit || new Decimal(0)).toFixed(2),
        notes,
        tags,
        screenshot,
        // New values
        trade.tradeId || "",
        trade.orderId || "",
        (trade.fundingFee || new Decimal(0)).toFixed(4),
        (trade.tradingFee || new Decimal(0)).toFixed(4),
        (trade.realizedPnl || new Decimal(0)).toFixed(4),
        trade.isManual !== false ? "true" : "false",
        trade.entryDate || "",
        ...tpData,
      ].join(",");
    });
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "TradeJournal.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  syncBitunixHistory: async () => {
    await syncService.syncBitunixPositions();
  },
  importFromCSV: (file: File) => {
    if (!browser) return;

    // P0 Fix: File size validation
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      uiStore.showError(
        `Die CSV-Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(
          1
        )}MB). ` + `Maximum: 5MB. Bitte teilen Sie die Datei auf.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((line) => line.trim() !== "");

      // P0 Fix: Maximum 1000 trades per import to prevent browser freeze
      const MAX_IMPORT_LINES = 1001; // 1 header + 1000 trades
      if (lines.length > MAX_IMPORT_LINES) {
        uiStore.showError(
          `Zu viele Zeilen (${lines.length - 1} Trades). ` +
          `Maximum: 1000 Trades pro Import. ` +
          `Bitte teilen Sie die CSV-Datei auf.`
        );
        return;
      }

      if (lines.length < 2) {
        uiStore.showError("CSV ist leer oder hat nur eine Kopfzeile.");
        return;
      }

      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^\uFEFF/, ""));
      // Map possible headers to internal keys
      const headerMap: { [key: string]: string } = {
        ID: "ID",
        Datum: "Datum",
        Date: "Datum",
        Uhrzeit: "Uhrzeit",
        Time: "Uhrzeit",
        Symbol: "Symbol",
        Typ: "Typ",
        Type: "Typ",
        Status: "Status",
        "Konto Guthaben": "Konto Guthaben",
        "Account Balance": "Konto Guthaben",
        "Risiko %": "Risiko %",
        "Risk %": "Risiko %",
        Hebel: "Hebel",
        Leverage: "Hebel",
        "Gebuehren %": "Gebuehren %",
        "Fees %": "Gebuehren %",
        Einstieg: "Einstieg",
        "Entry Price": "Einstieg",
        Entry: "Einstieg",
        Exit: "Exit",
        "Exit Price": "Exit",
        MAE: "MAE",
        MFE: "MFE",
        Efficiency: "Efficiency",
        "Stop Loss": "Stop Loss",
        "Gewichtetes R/R": "Gewichtetes R/R",
        "Weighted R/R": "Gewichtetes R/R",
        "Gesamt Netto-Gewinn": "Gesamt Netto-Gewinn",
        "Total Net Profit": "Gesamt Netto-Gewinn",
        "Risiko pro Trade (Waehrung)": "Risiko pro Trade (Waehrung)",
        "Risk Amount": "Risiko pro Trade (Waehrung)",
        "Gesamte Gebuehren": "Gesamte Gebuehren",
        "Total Fees": "Gesamte Gebuehren",
        "Max. potenzieller Gewinn": "Max. potenzieller Gewinn",
        "Max Potential Profit": "Max. potenzieller Gewinn",
        Notizen: "Notizen",
        Notes: "Notizen",
        Tags: "Tags",
        Screenshot: "Screenshot",
        Bild: "Screenshot",
        Image: "Screenshot",
        "Funding Fee": "Funding Fee",
        "Trading Fee": "Trading Fee",
        "Realized PnL": "Realized PnL",
        "Is Manual": "Is Manual",
        "Trade ID": "Trade ID",
        "Order ID": "Order ID",
        "Entry Date": "Einstiegsdatum",
        Einstiegsdatum: "Einstiegsdatum",
      };

      // Identify which language/set of headers is present
      const requiredKeys = [
        "ID",
        "Datum",
        "Uhrzeit",
        "Symbol",
        "Typ",
        "Status",
        "Einstieg",
        "Stop Loss",
      ];

      // Check if we have mapped all required keys
      const presentMappedKeys = new Set(
        headers.map((h) => headerMap[h]).filter(Boolean)
      );
      const missingKeys = requiredKeys.filter((k) => !presentMappedKeys.has(k));

      if (missingKeys.length > 0) {
        // If strictly missing required mapped keys
        uiStore.showError(
          `CSV-Datei fehlen benötigte Spalten (oder unbekannte Sprache): ${missingKeys.join(
            ", "
          )}`
        );
        return;
      }

      const entries = lines
        .slice(1)
        .map((line) => {
          const values = line.split(",");
          // Map values to standardized German keys internally using the header map
          const entry: Record<string, string> = {};
          headers.forEach((header, index) => {
            const mappedKey = headerMap[header];
            if (mappedKey) {
              entry[mappedKey] = values[index] ? values[index].trim() : "";
            } else if (
              header.startsWith("TP") &&
              (header.includes("Preis") ||
                header.includes("Price") ||
                header.includes("%"))
            ) {
              // Loose matching for TP columns which might be "TP1 Price", "TP1 Preis", "TP1 %"
              // We normalize them to "TP{n} Preis" and "TP{n} %"
              const match = header.match(/TP(\d+)\s*(Preis|Price|%)/);
              if (match) {
                const num = match[1];
                const type = match[2] === "%" ? "%" : "Preis";
                entry[`TP${num} ${type}`] = values[index]
                  ? values[index].trim()
                  : "";
              }
            }
          });

          try {
            const targets = [];
            for (let j = 1; j <= 5; j++) {
              const priceKey = `TP${j} Preis`;
              const percentKey = `TP${j} %`;
              if (entry[priceKey] && entry[percentKey]) {
                targets.push({
                  price: parseDecimal(entry[priceKey] as string),
                  percent: parseDecimal(entry[percentKey] as string),
                  isLocked: false,
                });
              }
            }

            // P0 Fix: Handle large IDs (precision loss) by generating new internal ID
            let internalId = parseFloat(entry.ID);
            const originalIdAsString = entry.ID;

            // Check if ID is potentially unsafe (too large for JS Number exact precision)
            if (
              originalIdAsString &&
              (originalIdAsString.length >= 16 ||
                !Number.isSafeInteger(internalId))
            ) {
              // Use deterministic hash for idempotency (djb2 variant)
              let hash = 5381;
              for (let i = 0; i < originalIdAsString.length; i++) {
                hash = (hash * 33) ^ originalIdAsString.charCodeAt(i);
              }
              internalId = Math.abs(hash >>> 0);
            }

            const { useUtcDateParsing } = get(settingsStore);
            const importedTrade: JournalEntry = {
              id: internalId,
              date: parseDateString(
                entry.Datum,
                entry.Uhrzeit,
                useUtcDateParsing
              ).toISOString(),
              symbol: entry.Symbol,
              tradeType: entry.Typ.toLowerCase(),
              status: entry.Status,
              accountSize: parseDecimal(entry["Konto Guthaben"] || "0"),
              riskPercentage: parseDecimal(entry["Risiko %"] || "0"),
              leverage: parseDecimal(entry.Hebel || "1"),
              fees: parseDecimal(entry["Gebuehren %"] || "0.1"),
              entryPrice: parseDecimal(entry.Einstieg),
              exitPrice: entry.Exit ? parseDecimal(entry.Exit) : undefined,
              mae: entry.MAE ? parseDecimal(entry.MAE) : undefined,
              mfe: entry.MFE ? parseDecimal(entry.MFE) : undefined,
              efficiency: entry.Efficiency
                ? parseDecimal(entry.Efficiency)
                : undefined,
              stopLossPrice: parseDecimal(entry["Stop Loss"]),
              totalRR: parseDecimal(entry["Gewichtetes R/R"] || "0"),
              totalNetProfit: parseDecimal(entry["Gesamt Netto-Gewinn"] || "0"),
              riskAmount: parseDecimal(
                entry["Risiko pro Trade (Waehrung)"] || "0"
              ),
              totalFees: parseDecimal(entry["Gesamte Gebuehren"] || "0"),
              maxPotentialProfit: parseDecimal(
                entry["Max. potenzieller Gewinn"] || "0"
              ),
              notes: entry.Notizen
                ? entry.Notizen.replace(/""/g, '"').slice(1, -1)
                : "",
              tags: entry.Tags
                ? entry.Tags.replace(/"/g, "")
                  .split(";")
                  .map((t) => t.trim())
                  .filter(Boolean)
                : [],
              screenshot: entry.Screenshot || undefined,
              targets: targets,
              // New fields
              tradeId:
                entry["Trade ID"] ||
                (originalIdAsString.length >= 16
                  ? originalIdAsString
                  : undefined),
              orderId: entry["Order ID"] || undefined,
              fundingFee: parseDecimal(entry["Funding Fee"] || "0"),
              tradingFee: parseDecimal(entry["Trading Fee"] || "0"),
              realizedPnl: parseDecimal(entry["Realized PnL"] || "0"),
              isManual: entry["Is Manual"]
                ? entry["Is Manual"] === "true"
                : true,
              entryDate: entry["Einstiegsdatum"]
                ? new Date(entry["Einstiegsdatum"]).toISOString()
                : undefined,
              calculatedTpDetails: [],
            };
            return normalizeJournalEntry(importedTrade);
          } catch (err: unknown) {
            console.warn("Fehler beim Verarbeiten einer Zeile:", entry, err);
            return null;
          }
        })
        .filter((entry): entry is JournalEntry => entry !== null);

      if (entries.length > 0) {
        const currentJournal = get(journalStore);
        const combined = [...currentJournal, ...entries];
        const unique = Array.from(
          new Map(combined.map((trade) => [trade.id, trade])).values()
        );

        if (
          await modalManager.show(
            "Import bestätigen",
            `Sie sind dabei, ${entries.length} Trades zu importieren. Bestehende Trades mit derselben ID werden überschrieben. Fortfahren?`,
            "confirm"
          )
        ) {
          journalStore.set(unique);
          trackCustomEvent("Journal", "Import", "CSV", entries.length);
          uiStore.showFeedback("save", 2000);
        }
      } else {
        uiStore.showError("Keine gültigen Einträge in der CSV-Datei gefunden.");
      }
    };
    reader.readAsText(file);
  },

  handleFetchPrice: async (isAuto = false) => {
    const currentTradeState = get(tradeStore);
    const settings = get(settingsStore);
    const symbol = currentTradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) {
      if (!isAuto) uiStore.showError("Bitte geben Sie ein Symbol ein.");
      return;
    }

    // Don't show global spinner for auto-updates to avoid flashing
    if (!isAuto)
      uiStore.update((state) => ({ ...state, isPriceFetching: true }));

    try {
      let price: Decimal;
      if (settings.apiProvider === "binance") {
        price = await apiService.fetchBinancePrice(symbol);
      } else {
        price = await apiService.fetchBitunixPrice(symbol);
      }
      updateTradeStore((state) => ({
        ...state,
        entryPrice: price.toDP(4).toNumber(),
      }));

      // Only show feedback on manual fetch
      if (!isAuto) uiStore.showFeedback("save", 700); // Use 'save' (checkmark) instead of 'copy'

      app.calculateAndDisplay();
    } catch (error) {
      // Suppress errors for auto-updates to avoid spamming the user
      if (!isAuto) {
        const message = error instanceof Error ? error.message : String(error);
        uiStore.showError(message);
      }
    } finally {
      if (!isAuto)
        uiStore.update((state) => ({ ...state, isPriceFetching: false }));
    }
  },

  setAtrMode: (mode: "manual" | "auto") => {
    updateTradeStore((state) => ({
      ...state,
      atrMode: mode,
      atrValue: mode === "auto" ? null : state.atrValue,
    }));
    // If switching to auto, fetch immediately
    if (mode === "auto") {
      app.fetchAtr();
    }
    app.calculateAndDisplay();
  },

  setAtrTimeframe: (timeframe: string) => {
    updateTradeStore((state) => ({
      ...state,
      atrTimeframe: timeframe,
    }));
    if (get(tradeStore).atrMode === "auto") {
      app.fetchAtr();
    }
  },

  fetchAtr: async (isAuto = false) => {
    const currentTradeState = get(tradeStore);
    const settings = get(settingsStore);
    const symbol = currentTradeState.symbol.toUpperCase().replace("/", "");
    if (!symbol) {
      if (!isAuto) uiStore.showError("Bitte geben Sie ein Symbol ein.");
      return;
    }

    if (!isAuto)
      uiStore.update((state) => ({ ...state, isPriceFetching: true }));

    try {
      let klines;
      if (settings.apiProvider === "binance") {
        klines = await apiService.fetchBinanceKlines(
          symbol,
          currentTradeState.atrTimeframe,
          15, // Default limit for ATR
          "high"
        );
      } else {
        klines = await apiService.fetchBitunixKlines(
          symbol,
          currentTradeState.atrTimeframe,
          15, // Default limit for ATR
          undefined,
          undefined,
          "high"
        );
      }

      const atr = calculator.calculateATR(klines);
      if (atr.lte(0)) {
        throw new Error(
          "ATR konnte nicht berechnet werden. Prüfen Sie das Symbol oder den Zeitrahmen."
        );
      }
      updateTradeStore((state) => ({
        ...state,
        atrValue: atr.toDP(4).toNumber(),
      }));
      app.calculateAndDisplay();

      if (!isAuto) uiStore.showFeedback("save", 700);
    } catch (error) {
      if (!isAuto) {
        const message = error instanceof Error ? error.message : String(error);
        uiStore.showError(message);
      }
    } finally {
      if (!isAuto)
        uiStore.update((state) => ({ ...state, isPriceFetching: false }));
    }
  },

  selectSymbolSuggestion: (symbol: string) => {
    updateTradeStore((s) => ({ ...s, symbol: symbol }));
    uiStore.update((s) => ({
      ...s,
      showSymbolSuggestions: false,
      symbolSuggestions: [],
    }));

    // Immediate fetch upon selection
    app.handleFetchPrice();
    if (get(tradeStore).useAtrSl && get(tradeStore).atrMode === "auto") {
      app.fetchAtr();
    }
  },

  updateSymbolSuggestions: (query: string) => {
    const upperQuery = query.toUpperCase().replace("/", "");
    let filtered: string[] = [];
    if (upperQuery) {
      filtered = CONSTANTS.SUGGESTED_SYMBOLS.filter((s) =>
        s.startsWith(upperQuery)
      );
    }
    uiStore.update((s) => ({
      ...s,
      symbolSuggestions: filtered,
      showSymbolSuggestions: filtered.length > 0,
    }));
  },
  togglePositionSizeLock: (forceState?: boolean) => {
    const currentTradeState = get(tradeStore);
    const currentResultsState = get(resultsStore);
    const shouldBeLocked =
      forceState !== undefined
        ? forceState
        : !currentTradeState.isPositionSizeLocked;

    if (
      shouldBeLocked &&
      (!currentResultsState.positionSize ||
        parseDecimal(currentResultsState.positionSize).lte(0))
    ) {
      uiStore.showError(
        "Positionsgröße kann nicht gesperrt werden, solange sie ungültig ist."
      );
      return;
    }

    updateTradeStore((state) => ({
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
    const currentTradeState = get(tradeStore);
    const shouldBeLocked =
      forceState !== undefined
        ? forceState
        : !currentTradeState.isRiskAmountLocked;

    if (shouldBeLocked && parseDecimal(currentTradeState.riskAmount).lte(0)) {
      uiStore.showError(
        "Risikobetrag kann nicht gesperrt werden, solange er ungültig ist."
      );
      return;
    }

    updateTradeStore((state) => ({
      ...state,
      isRiskAmountLocked: shouldBeLocked,
      isPositionSizeLocked: false,
      lockedPositionSize: null,
    }));

    app.calculateAndDisplay();
  },

  addTakeProfitRow: (
    price: number | null = null,
    percent: number | null = null,
    isLocked = false
  ) => {
    updateTradeStore((state) => ({
      ...state,
      targets: [...state.targets, { price, percent, isLocked }],
    }));
  },
  // New unified fetch function for Price + ATR + Analysis
  fetchAllAnalysisData: async (symbol: string, isAuto = false) => {
    if (!symbol || symbol.length < 3) return;

    // 1. Fetch Price Immediately (Critical, Independent)
    // We don't await this blocking other things, but we want UI to update on it.
    // handleFetchPrice already updates the store.
    app.handleFetchPrice(isAuto);

    const state = get(tradeStore);
    const settings = get(settingsStore);

    const currentTf = state.atrTimeframe;

    // 2. Fetch Current ATR (Critical) -> Update Immediately
    // We run this with High Priority to jump the queue if Technicals are loading
    try {
      let klines;
      if (settings.apiProvider === "binance") {
        // Binance Signature: symbol, interval, limit, priority
        klines = await apiService.fetchBinanceKlines(
          symbol,
          currentTf,
          99,
          "high"
        );
      } else {
        // Bitunix Signature: symbol, interval, limit, start, end, priority
        klines = await apiService.fetchBitunixKlines(
          symbol,
          currentTf,
          99,
          undefined,
          undefined,
          "high"
        );
      }

      const atr = calculator.calculateATR(klines);
      if (atr.gt(0)) {
        updateTradeStore((s) => ({
          ...s,
          atrValue: atr.toDP(4).toNumber(),
        }));
        // Trigger Recalculate if we are in Auto-Mode
        if (state.useAtrSl && state.atrMode === "auto") {
          app.calculateAndDisplay();
        }
      }
    } catch (e) {
      console.warn(`Failed to load Current ATR ${currentTf}`, e);
    }
  },

  adjustTpPercentages: (changedIndex: number | null) => {
    const currentAppState = get(tradeStore);
    if (
      changedIndex !== null &&
      currentAppState.targets[changedIndex].isLocked
    ) {
      return;
    }

    const targets = JSON.parse(JSON.stringify(currentAppState.targets));
    const ONE_HUNDRED = new Decimal(100);
    const ZERO = new Decimal(0);

    type DecimalTarget = {
      price: Decimal;
      percent: Decimal;
      isLocked: boolean;
      originalIndex: number;
    };

    const decTargets: DecimalTarget[] = targets.map(
      (
        t: { price: number | null; percent: number | null; isLocked: boolean },
        i: number
      ) => ({
        price: parseDecimal(t.price),
        percent: parseDecimal(t.percent),
        isLocked: t.isLocked,
        originalIndex: i,
      })
    );

    const totalSum = decTargets.reduce((sum, t) => sum.plus(t.percent), ZERO);
    const diff = ONE_HUNDRED.minus(totalSum);

    if (diff.isZero()) return;

    const otherUnlocked = decTargets.filter(
      (t) => !t.isLocked && t.originalIndex !== changedIndex
    );

    if (otherUnlocked.length === 0) {
      if (changedIndex !== null) {
        decTargets[changedIndex].percent =
          decTargets[changedIndex].percent.plus(diff);
      }
    } else if (diff.gt(ZERO)) {
      const share = diff.div(otherUnlocked.length);
      otherUnlocked.forEach((t) => {
        decTargets[t.originalIndex].percent =
          decTargets[t.originalIndex].percent.plus(share);
      });
    } else {
      let deficit = diff.abs();
      for (let i = otherUnlocked.length - 1; i >= 0; i--) {
        if (deficit.isZero()) break;
        const target = otherUnlocked[i];
        const originalTarget = decTargets[target.originalIndex];
        const reduction = Decimal.min(deficit, originalTarget.percent);

        originalTarget.percent = originalTarget.percent.minus(reduction);
        deficit = deficit.minus(reduction);
      }
    }

    let finalTargets = decTargets.map((t) => ({
      ...t,
      percent: t.percent.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    }));

    let finalSum = finalTargets.reduce((sum, t) => sum.plus(t.percent), ZERO);
    let roundingDiff = ONE_HUNDRED.minus(finalSum);

    if (!roundingDiff.isZero()) {
      let targetToAdjust = finalTargets.find(
        (t, i) =>
          !t.isLocked &&
          i !== changedIndex &&
          t.percent.plus(roundingDiff).gte(0)
      );
      if (!targetToAdjust) {
        targetToAdjust = finalTargets.find(
          (t) => !t.isLocked && t.percent.plus(roundingDiff).gte(0)
        );
      }
      if (targetToAdjust) {
        targetToAdjust.percent = targetToAdjust.percent.plus(roundingDiff);
      }
    }

    updateTradeStore((state) => ({
      ...state,
      targets: finalTargets.map((t) => ({
        price: t.price.toNumber(),
        percent: t.percent.toNumber(),
        isLocked: t.isLocked,
      })),
    }));
  },
};
