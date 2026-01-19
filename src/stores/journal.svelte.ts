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
            const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY) || "[]";
            const parsedData = JSON.parse(d);
            if (Array.isArray(parsedData)) {
                this.entries = parsedData.map((trade) => normalizeJournalEntry(trade));
            }
        } catch (e) {
            console.warn("Could not load journal from localStorage.", e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            localStorage.setItem(
                CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
                JSON.stringify(this.entries)
            );
        } catch (e) {
            console.warn("Could not save journal to localStorage.", e);
        }
    }

    // -- Actions --

    addEntry(entry: JournalEntry) {
        this.entries.push(entry);
    }

    updateEntry(updatedEntry: JournalEntry) {
        const index = this.entries.findIndex(e => e.id === updatedEntry.id);
        if (index !== -1) {
            this.entries[index] = updatedEntry;
        }
    }

    deleteEntry(id: string | number) {
        this.entries = this.entries.filter(e => e.id !== id);
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

    performanceMetrics = $derived(calculator.getPerformanceData(this.entries));
    qualityMetrics = $derived(calculator.getQualityData(this.entries));
    directionMetrics = $derived(calculator.getDirectionData(this.entries));
    tagMetrics = $derived(calculator.getTagData(this.entries));
    calendarMetrics = $derived(calculator.getCalendarData(this.entries));
    disciplineMetrics = $derived(calculator.getDisciplineData(this.entries));
    costMetrics = $derived(calculator.getCostData(this.entries));

    // Deep Dive
    timingMetrics = $derived(calculator.getTimingData(this.entries));
    confluenceMetrics = $derived(calculator.getConfluenceData(this.entries));
    durationStatsMetrics = $derived(calculator.getDurationStats(this.entries));
    durationDataMetrics = $derived(calculator.getDurationData(this.entries));
    tagEvolutionMetrics = $derived(calculator.getTagEvolution(this.entries));
    assetMetrics = $derived(calculator.getAssetData(this.entries));
    riskMetrics = $derived(calculator.getRiskData(this.entries));
    marketMetrics = $derived(calculator.getMarketData(this.entries));
    psychologyMetrics = $derived(calculator.getPsychologyData(this.entries));

    // 6-Pillars
    executionMetrics = $derived(calculator.getExecutionEfficiencyData(this.entries));
    riskRadarMetrics = $derived(calculator.getVisualRiskRadarData(this.entries));
    marketContextMetrics = $derived(calculator.getVolatilityMatrixData(this.entries));
    systemQualityMetrics = $derived(calculator.getSystemQualityData(this.entries));

    // Legacy subscribe for backward compatibility
    subscribe(fn: (value: JournalEntry[]) => void) {
        fn(this.entries);
        return $effect.root(() => {
            $effect(() => {
                fn(this.entries);
            });
        });
    }
}

export const journalState = new JournalManager();
