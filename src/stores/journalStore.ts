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
  loadJournalFromLocalStorage()
);

journalStore.subscribe((value) => {
  if (browser) {
    try {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify(value)
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

