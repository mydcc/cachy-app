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
import { settingsState } from "./settings.svelte";
import { untrack } from "svelte";
import { safeJsonParse } from "../utils/safeJson";
import { serializationService } from "../services/serializationService";

export class JournalManager {
  entries = $state<JournalEntry[]>([]);
  private effectCleanup: (() => void) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightSave: Promise<void> | null = null;
  private pendingSaveRequested = false;
  private effectActive = false;
  private unloadHandler: (() => void) | null = null;

  constructor() {
    if (browser) {
      this.load();
      this.effectActive = true;

      // Auto-save effect with 500ms debounce
      this.effectCleanup = $effect.root(() => {
        $effect(() => {
          if (!this.effectActive) return;
          // Track entries reactivity
          void this.entries.length;
          for (const e of this.entries) void e;

          untrack(() => {
            if (this.saveTimer) clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
              void this.save();
            }, 500);
          });
        });
      });

      // Synchronously commit any pending state on page unload/reload (AC#4)
      if (typeof window !== "undefined") {
        this.unloadHandler = () => {
          if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
          }
          this.saveSync();
        };
        window.addEventListener("pagehide", this.unloadHandler);
        window.addEventListener("beforeunload", this.unloadHandler);
      }
    }
  }

  destroy() {
    if (this.effectCleanup) {
      this.effectCleanup();
      this.effectCleanup = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.unloadHandler && typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.unloadHandler);
      window.removeEventListener("beforeunload", this.unloadHandler);
      this.unloadHandler = null;
    }
  }

  /** Immediately flush any pending debounced save */
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.save();
  }

  private load() {
    if (!browser || typeof localStorage === "undefined") return;
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
        this.entries = sliced.map((trade) => normalizeJournalEntry(trade));

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
        .repairMissingAtr(() => {
          // Progress callback is required by repairMissingAtr but intentionally
          // does nothing: this repair runs silently in the background with no
          // UI feedback. Failures surface via the .catch() below.
        })
        .catch((err) => {
          console.warn("[Journal] ATR auto-calculation failed:", err);
        });
    }
  }

  /** Synchronous save used during unload (pagehide / beforeunload) when async tasks cannot be scheduled */
  private saveSync() {
    if (!browser || !this.effectActive || typeof localStorage === "undefined") return;
    try {
      const data = $state.snapshot(this.entries);
      const json = JSON.stringify(data);
      const current = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);

      if (current !== json) {
        StorageHelper.safeSave(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, json);
      }
    } catch (e) {
      console.error("[Journal] Synchronous unload save failed:", e);
    }
  }

  private async save(): Promise<void> {
    if (!browser || !this.effectActive || typeof localStorage === "undefined") return;

    if (this.inFlightSave) {
      this.pendingSaveRequested = true;
      await this.inFlightSave;
      return;
    }

    this.inFlightSave = (async () => {
      try {
        do {
          this.pendingSaveRequested = false;
          const data = $state.snapshot(this.entries);
          const json = await serializationService.stringifyAsync(data);
          const current = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);

          // Dirty check: only save if data actually changed
          if (current !== json) {
            const success = StorageHelper.safeSave(
              CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
              json,
            );

            if (!success) {
              console.error("[Journal] Failed to save after retry");
              uiState.showError("journal.saveFailed");
            }
          }
        } while (this.pendingSaveRequested);
      } catch (e) {
        console.error("[Journal] Save error:", e);
        uiState.showError("journal.saveError");
      } finally {
        this.inFlightSave = null;
      }
    })();

    await this.inFlightSave;
  }

  // -- Actions --

  /**
   * The single write path for a new journal entry.
   *
   * A simulated fill (FEAT-0012) is written only when the user has asked for
   * it — reviewing paper trades afterwards is most of the point of paper
   * trading, so the setting defaults to on, but someone who wants a journal
   * of real trades only can say so and this drops the entry at the door
   * rather than filtering it back out everywhere downstream.
   *
   * Returns false when the entry was deliberately not recorded.
   */
  addEntry(entry: JournalEntry): boolean {
    if (entry.isPaper === true && !settingsState.journalPaperTrades) {
      return false;
    }
    this.entries.push(entry);
    if (this.entries.length > 1000) {
      this.entries.shift();
    }
    return true;
  }

  updateEntry(updatedEntry: JournalEntry) {
    const index = this.entries.findIndex((e) => String(e.id) === String(updatedEntry.id));
    if (index !== -1) {
      this.entries[index] = updatedEntry;
    }
  }

  deleteEntry(id: string | number) {
    this.entries = this.entries.filter((e) => String(e.id) !== String(id));
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

  /**
   * Real trades only. Every statistic below is computed from this rather than
   * from `entries`, because a simulated fill in the win rate, the expectancy
   * or the equity curve makes the number a lie — and paper trades are in the
   * journal precisely so they can be reviewed, which is only useful if the
   * headline figures still describe real money.
   *
   * The journal *list* still shows them, badged; see JournalContent.
   */
  analysisEntries = $derived(this.entries.filter((e) => e.isPaper !== true));

  /** How many stored entries are simulated. Drives the list's paper filter. */
  paperEntryCount = $derived(
    this.entries.length - this.analysisEntries.length,
  );

  private analysisContext = $derived(calculator.getJournalContext(this.analysisEntries));

  performanceMetrics = $derived(calculator.getPerformanceData(this.analysisEntries, this.analysisContext));
  qualityMetrics = $derived(calculator.getQualityData(this.analysisEntries, this.analysisContext));
  directionMetrics = $derived(calculator.getDirectionData(this.analysisEntries, this.analysisContext));
  tagMetrics = $derived(calculator.getTagData(this.analysisEntries, this.analysisContext));
  calendarMetrics = $derived(calculator.getCalendarData(this.analysisEntries, this.analysisContext));
  disciplineMetrics = $derived(calculator.getDisciplineData(this.analysisEntries, this.analysisContext));
  costMetrics = $derived(calculator.getCostData(this.analysisEntries, this.analysisContext));

  // Deep Dive
  timingMetrics = $derived(calculator.getTimingData(this.analysisEntries, this.analysisContext));
  confluenceMetrics = $derived(calculator.getConfluenceData(this.analysisEntries, this.analysisContext));
  durationStatsMetrics = $derived(calculator.getDurationStats(this.analysisEntries, this.analysisContext));
  durationDataMetrics = $derived(calculator.getDurationData(this.analysisEntries, this.analysisContext));
  tagEvolutionMetrics = $derived(calculator.getTagEvolution(this.analysisEntries, this.analysisContext));
  assetMetrics = $derived(calculator.getAssetData(this.analysisEntries, this.analysisContext));
  riskMetrics = $derived(calculator.getRiskData(this.analysisEntries, this.analysisContext));
  marketMetrics = $derived(calculator.getMarketData(this.analysisEntries, this.analysisContext));
  psychologyMetrics = $derived(calculator.getPsychologyData(this.analysisEntries, this.analysisContext));

  // 6-Pillars
  executionMetrics = $derived(calculator.getExecutionEfficiencyData(this.analysisEntries, this.analysisContext));
  riskRadarMetrics = $derived(calculator.getVisualRiskRadarData(this.analysisEntries, this.analysisContext));
  marketContextMetrics = $derived(calculator.getVolatilityMatrixData(this.analysisEntries, this.analysisContext));
  systemQualityMetrics = $derived(calculator.getSystemQualityData(this.analysisEntries, this.analysisContext));

  // Legacy subscribe for backward compatibility
  subscribe(fn: (value: JournalEntry[]) => void) {
    let localTimer: ReturnType<typeof setTimeout> | null = null;
    fn(this.entries);
    const cleanup = $effect.root(() => {
      $effect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- bare read registers the $effect dependency
        this.entries; // Track
        untrack(() => {
          if (localTimer) clearTimeout(localTimer);
          localTimer = setTimeout(() => {
            fn(this.entries);
            localTimer = null;
          }, 20);
        });
      });
    });
    return () => {
      cleanup();
      if (localTimer) clearTimeout(localTimer);
    };
  }
}

export const journalState = new JournalManager();

// HMR: Cleanup on module disposal to prevent timers and effect leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    journalState.destroy();
  });
}
