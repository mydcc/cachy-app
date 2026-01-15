import { get } from "svelte/store";
import {
  parseDecimal,
  parseDateString,
  normalizeJournalEntry,
} from "../utils/utils";
import { CONSTANTS } from "../lib/constants";
import { uiStore } from "../stores/uiStore";
import { settingsStore } from "../stores/settingsStore";
import { journalStore } from "../stores/journalStore";
import { modalManager } from "./modalManager";
import { trackCustomEvent } from "./trackingService";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";
import { browser } from "$app/environment";
import { storageUtils } from "../utils/storageUtils";

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

export const csvService = {
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

      // Helper to robustly split CSV lines respecting quotes
      const splitCSV = (str: string) => {
        const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
        return str.split(regex);
      };

      // Helper to clean CSV values (remove quotes, unescape double quotes)
      const cleanCSVValue = (val: string) => {
        val = val.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
          return val.replace(/""/g, '"');
        }
        return val;
      };

      const headers = splitCSV(lines[0]).map((h) =>
        cleanCSVValue(h.replace(/^\uFEFF/, ""))
      );
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
          const values = splitCSV(line);
          // Map values to standardized German keys internally using the header map
          const entry: Record<string, string> = {};
          headers.forEach((header, index) => {
            const mappedKey = headerMap[header];
            const cleanVal = values[index] ? cleanCSVValue(values[index]) : "";

            if (mappedKey) {
              entry[mappedKey] = cleanVal;
            } else if (
              header.startsWith("TP") &&
              (header.includes("Preis") ||
                header.includes("Price") ||
                header.includes("%"))
            ) {
              // Loose matching for TP columns
              const match = header.match(/TP(\d+)\s*(Preis|Price|%)/);
              if (match) {
                const num = match[1];
                const type = match[2] === "%" ? "%" : "Preis";
                entry[`TP${num} ${type}`] = cleanVal;
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

            // Check if ID is potentially unsafe
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
              notes: entry.Notizen || "",
              tags: entry.Tags
                ? entry.Tags.split(";")
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
          // Save to LocalStorage via app helper or directly
          try {
            const jsonData = JSON.stringify(unique);
            storageUtils.safeSetItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, jsonData);
          } catch (error) {
             // Error handled by storageUtils or logic in app usually, but we need it here
             uiStore.showError("Fehler beim Speichern nach Import.");
          }
          trackCustomEvent("Journal", "Import", "CSV", entries.length);
          uiStore.showFeedback("save", 2000);
        }
      } else {
        uiStore.showError("Keine gültigen Einträge in der CSV-Datei gefunden.");
      }
    };
    reader.readAsText(file);
  },
};
