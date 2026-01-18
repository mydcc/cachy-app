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

import { writable, derived } from "svelte/store";
import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { CONSTANTS } from "../lib/constants";
import { normalizeJournalEntry } from "../utils/utils";
import type { JournalEntry } from "./types";
import { calculator } from "../lib/calculator";

function loadJournalFromLocalStorage(): JournalEntry[] {
  if (!browser) return [];
  try {
    const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
    const parsedData = JSON.parse(d);
    if (!Array.isArray(parsedData)) return [];
    return parsedData.map((trade) => normalizeJournalEntry(trade));
  } catch (e) {
    console.warn("Could not load journal from localStorage.", e);
    // showError("Journal konnte nicht geladen werden."); // This would cause dependency cycle
    return [];
  }
}

export const journalStore = writable<JournalEntry[]>(
  loadJournalFromLocalStorage(),
);

journalStore.subscribe((value) => {
  if (browser) {
    try {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify(value),
      );
    } catch (e) {
      console.warn("Could not save journal to localStorage.", e);
    }
  }
});

// --- Derived Stores for Analytics ---
// These stores wrap the heavy calculations and ensure safe data access.

export const performanceMetrics = derived(journalStore, ($journal) => {
  return calculator.getPerformanceData($journal || []);
});

export const qualityMetrics = derived(journalStore, ($journal) => {
  return calculator.getQualityData($journal || []);
});

export const directionMetrics = derived(journalStore, ($journal) => {
  return calculator.getDirectionData($journal || []);
});

export const tagMetrics = derived(journalStore, ($journal) => {
  return calculator.getTagData($journal || []);
});

export const calendarMetrics = derived(journalStore, ($journal) => {
  return calculator.getCalendarData($journal || []);
});

export const disciplineMetrics = derived(journalStore, ($journal) => {
  return calculator.getDisciplineData($journal || []);
});

export const costMetrics = derived(journalStore, ($journal) => {
  return calculator.getCostData($journal || []);
});

// Deep Dive Metrics
export const timingMetrics = derived(journalStore, ($journal) => {
  return calculator.getTimingData($journal || []);
});

export const confluenceMetrics = derived(journalStore, ($journal) => {
  return calculator.getConfluenceData($journal || []);
});

export const durationStatsMetrics = derived(journalStore, ($journal) => {
  return calculator.getDurationStats($journal || []);
});

export const durationDataMetrics = derived(journalStore, ($journal) => {
  return calculator.getDurationData($journal || []);
});

export const tagEvolutionMetrics = derived(journalStore, ($journal) => {
  return calculator.getTagEvolution($journal || []);
});

export const assetMetrics = derived(journalStore, ($journal) => {
  return calculator.getAssetData($journal || []);
});

export const riskMetrics = derived(journalStore, ($journal) => {
  return calculator.getRiskData($journal || []);
});

export const marketMetrics = derived(journalStore, ($journal) => {
  return calculator.getMarketData($journal || []);
});

export const psychologyMetrics = derived(journalStore, ($journal) => {
  return calculator.getPsychologyData($journal || []);
});

// New Stores for 6-Pillars Model
export const executionMetrics = derived(journalStore, ($journal) => {
  return calculator.getExecutionEfficiencyData($journal || []);
});

export const riskRadarMetrics = derived(journalStore, ($journal) => {
  return calculator.getVisualRiskRadarData($journal || []);
});

export const marketContextMetrics = derived(journalStore, ($journal) => {
  return calculator.getVolatilityMatrixData($journal || []);
});

export const systemQualityMetrics = derived(journalStore, ($journal) => {
  return calculator.getSystemQualityData($journal || []);
});
