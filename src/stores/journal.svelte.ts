/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { normalizeJournalEntry } from "../utils/utils";
import type { JournalEntry } from "./types";
import { calculator } from "../lib/calculator";
import { StorageHelper } from "../utils/storageHelper";
import { uiState } from "./ui.svelte";
import { untrack } from "svelte";
import { safeJsonParse } from "../utils/safeJson";

class JournalManager {
  entries = $state<JournalEntry[]>([]);

  constructor() {
    if (browser) {
      this.load();

      // Auto-save effect
      $effect.root(() => {
        $effect(() => {
          this.save();
        });
      });
    }
  }

  private load() {
    if (!browser) return;
    try {
      const d =
        localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
      const parsedData = safeJsonParse(d);
      if (Array.isArray(parsedData)) {
        // Enforce limit to prevent TBT/Crash on huge journals
        // Taking last 1000 entries (assuming chronological order append)
        // Ideally we should reverse logic if they are appended, but usually latest are last.
        // Actually, users might prefer seeing latest.
        // If we just slice, we keep first 1000. If we want latest, we might need to check sorting.
        // Assuming append-only: latest are at the end.
        const limit = 1000;
        const sliced = parsedData.length > limit ? parsedData.slice(-limit) : parsedData;
        this.entries = sliced.map((trade: any) => normalizeJournalEntry(trade));

        // Auto-calculate missing ATR values for closed trades
        this.autoCalculateMissingAtr();
      }
    } catch (e) {
      console.warn("Could not load journal from localStorage.", e);
    }
  }

  /**
   * Automatically calculates and fills missing atrValue for closed trades (Won/Lost)
   * This runs asynchronously in the background after journal load
   */
  private async autoCalculateMissingAtr() {
    if (!browser) return;

    // Import dynamically to avoid circular dependencies
    const { dataRepairService } = await import("../services/dataRepairService");

    // Check if there are any trades needing ATR calculation
    const count = dataRepairService.scanForMissingAtr();

    if (count > 0) {
      // Run repair in background without blocking UI
      dataRepairService
        .repairMissingAtr((current, total, message) => {
          // Silent background operation - no UI feedback
          if (current === total) {
          }
        })
        .catch((err) => {
          console.warn("[Journal] ATR auto-calculation failed:", err);
        });
    }
  }

  private save() {
    if (!browser) return;
    try {
      const data = JSON.stringify(this.entries);
      const success = StorageHelper.safeSave(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        data,
      );

      if (!success) {
        console.error("[Journal] Failed to save after retry");
        uiState.showError("journal.saveFailed");
      }
    } catch (e) {
      console.error("[Journal] Save error:", e);
      uiState.showError("journal.saveError");
    }
  }

  // -- Actions --

  addEntry(entry: JournalEntry) {
    this.entries.push(entry);
  }

  updateEntry(updatedEntry: JournalEntry) {
    const index = this.entries.findIndex((e) => e.id === updatedEntry.id);
    if (index !== -1) {
      this.entries[index] = updatedEntry;
    }
  }

  deleteEntry(id: string | number) {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  importEntries(newEntries: JournalEntry[]) {
    this.entries = [...this.entries, ...newEntries];
  }

  set(entries: JournalEntry[]) {
    this.entries = entries;
  }

  // Legacy support
  update(fn: (entries: JournalEntry[]) => JournalEntry[]) {
    this.entries = fn(this.entries);
  }

  // -- Derived Metrics ($derived) --

  private allMetrics = $derived(calculator.getJournalAnalysis(this.entries));

  performanceMetrics = $derived(this.allMetrics.performanceMetrics);
  qualityMetrics = $derived(this.allMetrics.qualityMetrics);
  directionMetrics = $derived(this.allMetrics.directionMetrics);
  tagMetrics = $derived(this.allMetrics.tagMetrics);
  calendarMetrics = $derived(this.allMetrics.calendarMetrics);
  disciplineMetrics = $derived(this.allMetrics.disciplineMetrics);
  costMetrics = $derived(this.allMetrics.costMetrics);

  // Deep Dive
  timingMetrics = $derived(this.allMetrics.timingMetrics);
  confluenceMetrics = $derived(this.allMetrics.confluenceMetrics);
  durationStatsMetrics = $derived(this.allMetrics.durationStatsMetrics);
  durationDataMetrics = $derived(this.allMetrics.durationDataMetrics);
  tagEvolutionMetrics = $derived(this.allMetrics.tagEvolutionMetrics);
  assetMetrics = $derived(this.allMetrics.assetMetrics);
  riskMetrics = $derived(this.allMetrics.riskMetrics);
  marketMetrics = $derived(this.allMetrics.marketMetrics);
  psychologyMetrics = $derived(this.allMetrics.psychologyMetrics);

  // 6-Pillars
  executionMetrics = $derived(this.allMetrics.executionMetrics);
  riskRadarMetrics = $derived(this.allMetrics.riskRadarMetrics);
  marketContextMetrics = $derived(this.allMetrics.marketContextMetrics);
  systemQualityMetrics = $derived(this.allMetrics.systemQualityMetrics);

  private notifyTimer: any = null;

  // Legacy subscribe for backward compatibility
  subscribe(fn: (value: JournalEntry[]) => void) {
    fn(this.entries);
    return $effect.root(() => {
      $effect(() => {
        this.entries; // Track
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(this.entries);
            this.notifyTimer = null;
          }, 20);
        });
      });
    });
  }
}

export const journalState = new JournalManager();
