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
import { settingsState } from "../stores/settings.svelte";
import { _ } from "../locales/i18n";
import {
  parseDecimal,
  parseDateString,
  normalizeJournalEntry,
} from "../utils/utils";
import type { JournalEntry } from "../stores/types";
import { Decimal } from "decimal.js";

export const csvService = {
  /**
   * Generates a CSV string from an array of JournalEntry objects.
   * Includes protection against CSV Injection (Formula Injection).
   */
  generateCSV(journalData: JournalEntry[]): string {
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
      // Use ISO format (UTC) for robustness instead of locale-specific "de-DE"
      // YYYY-MM-DD and HH:mm:ss
      const isoString = date.toISOString();
      const dateStr = isoString.split("T")[0];
      const timeStr = isoString.split("T")[1].split(".")[0];

      const escape = (val: string | undefined | null) =>
        this.escapeCSVValue(val);

      const notes = trade.notes
        ? `"${escape(trade.notes)?.replace(/"/g, '""').replace(/\n/g, " ")}"`
        : "";
      const tags =
        trade.tags && trade.tags.length > 0
          ? `"${escape(trade.tags.join(";"))}"`
          : "";
      const screenshot = escape(trade.screenshot) || "";

      const tpData = Array.from({ length: 5 }, (_, i) => [
        (trade.targets?.[i]?.price || new Decimal(0)).toFixed(4),
        (trade.targets?.[i]?.percent || new Decimal(0)).toFixed(2),
      ]).flat();

      return [
        trade.id,
        dateStr,
        timeStr,
        escape(trade.symbol),
        escape(trade.tradeType),
        escape(trade.status),
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
        escape(trade.tradeId) || "",
        escape(trade.orderId) || "",
        (trade.fundingFee || new Decimal(0)).toFixed(4),
        (trade.tradingFee || new Decimal(0)).toFixed(4),
        (trade.realizedPnl || new Decimal(0)).toFixed(4),
        trade.isManual !== false ? "true" : "false",
        trade.entryDate || "",
        ...tpData,
      ].join(",");
    });

    return (
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      rows.join("\n")
    );
  },

  /**
   * Sanitizes a value to prevent CSV Formula Injection.
   * If a value starts with =, +, -, or @, it prepends a single quote.
   */
  escapeCSVValue(val: string | number | undefined | null): string {
    if (val === undefined || val === null) return "";
    const str = String(val);
    if (/^[=+\-@]/.test(str)) {
      return "'" + str;
    }
    return str;
  },

  /**
   * Robustly splits a CSV line handling commas inside quotes.
   */
  splitCSV(str: string): string[] {
    // Regex matches a comma only if it is followed by an even number of quotes (or 0) until the end of the line
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return str.split(regex);
  },

  /**
   * Cleans a CSV value by removing surrounding quotes and unescaping double quotes.
   */
  cleanCSVValue(val: string): string {
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
      val = val.replace(/""/g, '"');
    }
    // Remove potential CSV injection escape character
    if (val.startsWith("'")) {
      return val.substring(1);
    }
    return val;
  },

  /**
   * Parses CSV content string into JournalEntry objects.
   * Returns a list of normalized trades.
   * Throws errors if format is invalid or limits are exceeded.
   */
  parseCSVContent(text: string): JournalEntry[] {
    const lines = text.split("\n").filter((line) => line.trim() !== "");

    // Validation: Maximum 1000 trades per import
    const MAX_IMPORT_LINES = 1001; // 1 header + 1000 trades
    if (lines.length > MAX_IMPORT_LINES) {
      const translate = get(_);
      const msg =
        (translate("csvTooManyLines", {
          values: {
            count: lines.length - 1,
            max: 1000,
          },
        }) as string) ||
        `Too many lines (${lines.length - 1}). Max 1000 trades per import.`;
      throw new Error(msg);
    }

    if (lines.length < 2) {
      const translate = get(_);
      throw new Error(
        (translate("csvEmpty") as string) ||
        "CSV is empty or has only a header.",
      );
    }

    const headers = this.splitCSV(lines[0]).map((h) =>
      this.cleanCSVValue(h.replace(/^\uFEFF/, "")),
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
      const translate = get(_);
      const msg =
        (translate("csvMissingColumns", {
          values: {
            columns: missingKeys.join(", "),
          },
        }) as string) ||
        `CSV file missing required columns: ${missingKeys.join(", ")}`;
      throw new Error(msg);
    }

    const { useUtcDateParsing } = settingsState;

    const entries = lines
      .slice(1)
      .map((line) => {
        const values = this.splitCSV(line);
        const entry: Record<string, string> = {};

        headers.forEach((header, index) => {
          const mappedKey = headerMap[header];
          const cleanVal = values[index]
            ? this.cleanCSVValue(values[index])
            : "";

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
                price: parseDecimal(entry[priceKey] as string),
                percent: parseDecimal(entry[percentKey] as string),
                isLocked: false,
              });
            }
          }

          // Handle large IDs / precision loss
          const originalIdAsString = entry.ID;
          let internalId: number;

          // Check length first to avoid precision loss during parseFloat
          if (
            originalIdAsString &&
            (originalIdAsString.length >= 16 ||
              !Number.isSafeInteger(parseFloat(originalIdAsString)))
          ) {
            // Deterministic hash (djb2)
            let hash = 5381;
            for (let i = 0; i < originalIdAsString.length; i++) {
              hash = (hash * 33) ^ originalIdAsString.charCodeAt(i);
            }
            internalId = Math.abs(hash >>> 0);
          } else {
            internalId = parseFloat(originalIdAsString);
          }

          const importedTrade: JournalEntry = {
            id: internalId,
            date: parseDateString(
              entry.Datum,
              entry.Uhrzeit,
              useUtcDateParsing,
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
              entry["Risiko pro Trade (Waehrung)"] || "0",
            ),
            totalFees: parseDecimal(entry["Gesamte Gebuehren"] || "0"),
            maxPotentialProfit: parseDecimal(
              entry["Max. potenzieller Gewinn"] || "0",
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
            fundingFee: parseDecimal(entry["Funding Fee"] || "0"),
            tradingFee: parseDecimal(entry["Trading Fee"] || "0"),
            realizedPnl: parseDecimal(entry["Realized PnL"] || "0"),
            isManual: entry["Is Manual"] ? entry["Is Manual"] === "true" : true,
            entryDate: entry["Einstiegsdatum"]
              ? new Date(entry["Einstiegsdatum"]).toISOString()
              : undefined,
            calculatedTpDetails: [],
          };
          return normalizeJournalEntry(importedTrade);
        } catch (err) {
          console.warn("Error parsing CSV line:", entry, err);
          return null;
        }
      })
      .filter((entry): entry is JournalEntry => entry !== null);

    return entries;
  },
};
