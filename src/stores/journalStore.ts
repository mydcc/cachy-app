import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { CONSTANTS } from "../lib/constants";
import { normalizeJournalEntry } from "../utils/utils";
import type { JournalEntry } from "./types";

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
