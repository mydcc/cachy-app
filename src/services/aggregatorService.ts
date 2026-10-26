/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { browser } from "$app/env";
import type { JournalEntry } from "../stores/types";
import type { getJournalAnalysis } from "../lib/calculators/aggregator";
import { generateId } from "../utils/utils";

type AnalysisResult = ReturnType<typeof getJournalAnalysis>;

class AggregatorService {
    private worker: Worker | null = null;
    private pendingResolves = new Map<string, (val: AnalysisResult) => void>();
    private pendingRejects = new Map<string, (err: Error) => void>();
    private pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    constructor() {
        if (browser) {
            this.initWorker();
            // BUG-0725: the worker and its pending timers outlived the page.
            window.addEventListener("pagehide", () => this.terminate(), { once: true });
        }
    }

    /** Clears the timer that belongs to one settled request. */
    private clearTimer(id: string): void {
        const timer = this.pendingTimeouts.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.pendingTimeouts.delete(id);
        }
    }

    /**
     * Terminates the worker and fails every pending request (BUG-0725).
     *
     * Public so a test or a page-lifecycle hook can tear it down; the
     * constructor registers it on `pagehide`.
     */
    public terminate(): void {
        this.pendingTimeouts.forEach((timer) => clearTimeout(timer));
        this.pendingTimeouts.clear();
        this.pendingRejects.forEach((reject) => reject(new Error("Aggregator worker terminated")));
        this.pendingResolves.clear();
        this.pendingRejects.clear();
        this.worker?.terminate();
        this.worker = null;
    }

    private initWorker() {
        try {
            this.worker = new Worker(new URL("../workers/aggregator.worker.ts", import.meta.url), { type: "module" });
            this.worker.onmessage = (e) => {
                const { id, result, error } = e.data;
                if (this.pendingResolves.has(id)) {
                    this.clearTimer(id);
                    if (error) {
                        this.pendingRejects.get(id)?.(new Error(error));
                    } else {
                        this.pendingResolves.get(id)?.(result);
                    }
                    this.pendingResolves.delete(id);
                    this.pendingRejects.delete(id);
                }
            };
            this.worker.onerror = (e) => {
                console.error("[AggregatorService] Worker Error", e);
                // Fail all pending and drop the dead worker. `analyze()` then
                // falls back to the inline path instead of posting into a
                // terminated thread.
                this.pendingTimeouts.forEach((timer) => clearTimeout(timer));
                this.pendingTimeouts.clear();
                this.pendingRejects.forEach(reject => reject(new Error("Worker Error")));
                this.pendingResolves.clear();
                this.pendingRejects.clear();
                this.worker?.terminate();
                this.worker = null;
            };
        } catch (e) {
            console.error("[AggregatorService] Failed to init worker", e);
        }
    }

    public async analyze(journal: JournalEntry[]): Promise<AnalysisResult> {
        if (!this.worker) {
            // Fallback for SSR or if worker failed
            const { getJournalAnalysis } = await import("../lib/calculators/aggregator");
            return getJournalAnalysis(journal);
        }

        const id = generateId();
        return new Promise((resolve, reject) => {
            this.pendingResolves.set(id, resolve);
            this.pendingRejects.set(id, reject);

            this.worker!.postMessage({ journal, id });

            // Timeout safety. Stored so a fast answer clears it instead of
            // leaving a timer holding the closure until it fires (BUG-0725).
            const timer = setTimeout(() => {
                if (this.pendingResolves.has(id)) {
                    this.pendingRejects.get(id)?.(new Error("Analysis Timed Out"));
                    this.pendingResolves.delete(id);
                    this.pendingRejects.delete(id);
                }
                this.pendingTimeouts.delete(id);
            }, 10000);
            this.pendingTimeouts.set(id, timer);
        });
    }
}

export const aggregatorService = new AggregatorService();
