import { Decimal } from "decimal.js";
import { get } from "svelte/store";
import {
  parseDateString,
  normalizeJournalEntry,
  parseDecimal,
} from "../utils/utils";
import { settingsStore } from "../stores/settingsStore";
import type { JournalEntry } from "../stores/types";

// Helper to robustly split CSV lines respecting quotes
export const splitCSV = (str: string) => {
  const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
  return str.split(regex);
};

// Helper to clean CSV values
export const cleanCSVValue = (val: string) => {
  val = val.trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1);
    return val.replace(/""/g, '"');
  }
  return val;
};

// Helper to escape values for CSV Export (Security: Formula Injection)
export const escapeCSVValue = (val: string | number | null | undefined) => {
  if (val === null || val === undefined) return "";
  let stringVal = String(val);

  // Prevent Formula Injection
  if (/^[=+\-@]/.test(stringVal)) {
    stringVal = "'" + stringVal;
  }

  // Escape double quotes
  if (stringVal.includes('"')) {
    stringVal = stringVal.replace(/"/g, '""');
  }

  // Wrap in quotes if it contains comma, newline or quotes
  if (
    stringVal.includes(",") ||
    stringVal.includes("\n") ||
    stringVal.includes('"')
  ) {
    return `"${stringVal}"`;
  }
  return stringVal;
};

/**
 * Parses a string using heuristics to detect German vs English number formats.
 * e.g. "1.200,50" -> 1200.50
 *      "1,200.50" -> 1200.50
 *      "12,50"    -> 12.50
 */
export function parseLocalizedDecimal(value: string | undefined): Decimal {
  if (!value) return new Decimal(0);
  const trimmed = value.trim();
  if (!trimmed) return new Decimal(0);

  // Check occurrences
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  let normalized = trimmed;

  if (hasComma && hasDot) {
    const lastComma = trimmed.lastIndexOf(",");
    const lastDot = trimmed.lastIndexOf(".");

    if (lastComma > lastDot) {
      // German format: 1.200,50 -> Remove dots, replace comma with dot
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    } else {
      // English format: 1,200.50 -> Remove commas
      normalized = trimmed.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Only comma: "12,50" or "1,200"
    // Heuristic: If it has 2 decimal places (e.g. 12,50), it's likely a decimal separator.
    // If it has 3 decimal places (e.g. 1,200), it's ambiguous (could be 1.2 or 1200).
    // Given we are parsing finance data, "1,200" is usually 1200 (English).
    // But "1,5" is 1.5 (German).
    // Let's assume: If it matches X,XX or X,X it is German Decimal.
    if (/^\d+,\d{1,2}$/.test(trimmed)) {
      normalized = trimmed.replace(",", ".");
    } else {
      // Assume English thousands separator for "1,000" or "1,000,000"
      // UNLESS the user explicitly wants German parsing?
      // For safety in this hybrid environment, if we strip the comma and it's a valid number, use that.
      normalized = trimmed.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Only dot: "12.50" or "1.200"
    // "1.200" could be German thousands.
    // But standard JS parseFloat handles dots as decimals.
    // We will stick to standard behavior (dot is decimal) unless strong evidence otherwise.
    // (No change needed)
  }

  try {
    return new Decimal(normalized);
  } catch {
    return new Decimal(0);
  }
}

export const csvService = {
  parseCSVContent: (
    text: string,
  ): { entries: JournalEntry[]; error?: string } => {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) {
      return {
        entries: [],
        error: "CSV ist leer oder hat nur eine Kopfzeile.",
      };
    }

    const headers = splitCSV(lines[0]).map((h) =>
      cleanCSVValue(h.replace(/^\uFEFF/, "")),
    );

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
    const presentMappedKeys = new Set(
      headers.map((h) => headerMap[h]).filter(Boolean),
    );
    const missingKeys = requiredKeys.filter((k) => !presentMappedKeys.has(k));

    if (missingKeys.length > 0) {
      return {
        entries: [],
        error: `CSV-Datei fehlen benötigte Spalten: ${missingKeys.join(", ")}`,
      };
    }

    const entries = lines
      .slice(1)
      .map((line) => {
        const values = splitCSV(line);
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
                price: parseLocalizedDecimal(entry[priceKey]),
                percent: parseLocalizedDecimal(entry[percentKey]),
                isLocked: false,
              });
            }
          }

          let internalId = parseFloat(entry.ID);
          const originalIdAsString = entry.ID;

          if (
            originalIdAsString &&
            (originalIdAsString.length >= 16 ||
              !Number.isSafeInteger(internalId))
          ) {
            let hash = 5381;
            for (let i = 0; i < originalIdAsString.length; i++) {
              hash = (hash * 33) ^ originalIdAsString.charCodeAt(i);
            }
            internalId = Math.abs(hash >>> 0);
          }

          const settings = get(settingsStore); // Note: Calling get() inside a synchronous function is fine if store is initialized
          const importedTrade: JournalEntry = {
            id: internalId,
            date: parseDateString(
              entry.Datum,
              entry.Uhrzeit,
              settings?.useUtcDateParsing ?? true,
            ).toISOString(),
            symbol: entry.Symbol,
            tradeType: entry.Typ.toLowerCase(),
            status: entry.Status,
            accountSize: parseLocalizedDecimal(entry["Konto Guthaben"]),
            riskPercentage: parseLocalizedDecimal(entry["Risiko %"]),
            leverage: parseLocalizedDecimal(entry.Hebel || "1"),
            fees: parseLocalizedDecimal(entry["Gebuehren %"] || "0.1"),
            entryPrice: parseLocalizedDecimal(entry.Einstieg),
            exitPrice: entry.Exit
              ? parseLocalizedDecimal(entry.Exit)
              : undefined,
            mae: entry.MAE ? parseLocalizedDecimal(entry.MAE) : undefined,
            mfe: entry.MFE ? parseLocalizedDecimal(entry.MFE) : undefined,
            efficiency: entry.Efficiency
              ? parseLocalizedDecimal(entry.Efficiency)
              : undefined,
            stopLossPrice: parseLocalizedDecimal(entry["Stop Loss"]),
            totalRR: parseLocalizedDecimal(entry["Gewichtetes R/R"]),
            totalNetProfit: parseLocalizedDecimal(entry["Gesamt Netto-Gewinn"]),
            riskAmount: parseLocalizedDecimal(
              entry["Risiko pro Trade (Waehrung)"],
            ),
            totalFees: parseLocalizedDecimal(entry["Gesamte Gebuehren"]),
            maxPotentialProfit: parseLocalizedDecimal(
              entry["Max. potenzieller Gewinn"],
            ),
            notes: entry.Notizen || "",
            tags: entry.Tags
              ? entry.Tags.split(";")
                  .map((t) => t.trim())
                  .filter(Boolean)
              : [],
            screenshot: entry.Screenshot || undefined,
            targets: targets,
            tradeId:
              entry["Trade ID"] ||
              (originalIdAsString.length >= 16
                ? originalIdAsString
                : undefined),
            orderId: entry["Order ID"] || undefined,
            fundingFee: parseLocalizedDecimal(entry["Funding Fee"]),
            tradingFee: parseLocalizedDecimal(entry["Trading Fee"]),
            realizedPnl: parseLocalizedDecimal(entry["Realized PnL"]),
            isManual: entry["Is Manual"] ? entry["Is Manual"] === "true" : true,
            entryDate: entry["Einstiegsdatum"]
              ? new Date(entry["Einstiegsdatum"]).toISOString()
              : undefined,
            calculatedTpDetails: [],
          };
          return normalizeJournalEntry(importedTrade);
        } catch (err) {
          console.warn("Fehler beim Verarbeiten einer Zeile:", entry, err);
          return null;
        }
      })
      .filter((entry): entry is JournalEntry => entry !== null);

    return { entries };
  },

  generateCSVContent: (journalData: JournalEntry[]): string => {
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
      // Use escapeCSVValue for safety
      const notes = escapeCSVValue(trade.notes);
      const tags =
        trade.tags && trade.tags.length > 0
          ? escapeCSVValue(trade.tags.join(";"))
          : "";
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

    return headers.join(",") + "\n" + rows.join("\n");
  },
};
