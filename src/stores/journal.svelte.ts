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

  private analysisContext = $derived(calculator.getJournalContext(this.entries));

  performanceMetrics = $derived(calculator.getPerformanceData(this.entries, this.analysisContext));
  qualityMetrics = $derived(calculator.getQualityData(this.entries, this.analysisContext));
  directionMetrics = $derived(calculator.getDirectionData(this.entries, this.analysisContext));
  tagMetrics = $derived(calculator.getTagData(this.entries, this.analysisContext));
  calendarMetrics = $derived(calculator.getCalendarData(this.entries, this.analysisContext));
  disciplineMetrics = $derived(calculator.getDisciplineData(this.entries, this.analysisContext));
  costMetrics = $derived(calculator.getCostData(this.entries, this.analysisContext));

  // Deep Dive
  timingMetrics = $derived(calculator.getTimingData(this.entries, this.analysisContext));
  confluenceMetrics = $derived(calculator.getConfluenceData(this.entries, this.analysisContext));
  durationStatsMetrics = $derived(calculator.getDurationStats(this.entries, this.analysisContext));
  durationDataMetrics = $derived(calculator.getDurationData(this.entries, this.analysisContext));
  tagEvolutionMetrics = $derived(calculator.getTagEvolution(this.entries, this.analysisContext));
  assetMetrics = $derived(calculator.getAssetData(this.entries, this.analysisContext));
  riskMetrics = $derived(calculator.getRiskData(this.entries, this.analysisContext));
  marketMetrics = $derived(calculator.getMarketData(this.entries, this.analysisContext));
  psychologyMetrics = $derived(calculator.getPsychologyData(this.entries, this.analysisContext));

  // 6-Pillars
  executionMetrics = $derived(calculator.getExecutionEfficiencyData(this.entries, this.analysisContext));
  riskRadarMetrics = $derived(calculator.getVisualRiskRadarData(this.entries, this.analysisContext));
  marketContextMetrics = $derived(calculator.getVolatilityMatrixData(this.entries, this.analysisContext));
  systemQualityMetrics = $derived(calculator.getSystemQualityData(this.entries, this.analysisContext));

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
