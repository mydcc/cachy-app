/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { browser } from "$app/environment";
import type { JournalEntry } from "../stores/types";
import type { getJournalAnalysis } from "../lib/calculators/aggregator";

type AnalysisResult = ReturnType<typeof getJournalAnalysis>;

class AggregatorService {
    private worker: Worker | null = null;
    private pendingResolves = new Map<string, (val: AnalysisResult) => void>();
    private pendingRejects = new Map<string, (err: Error) => void>();

    constructor() {
        if (browser) {
            this.initWorker();
        }
    }

    private initWorker() {
        try {
            this.worker = new Worker(new URL("../workers/aggregator.worker.ts", import.meta.url), { type: "module" });
            this.worker.onmessage = (e) => {
                const { id, result, error } = e.data;
                if (this.pendingResolves.has(id)) {
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
                // Fail all pending
                this.pendingRejects.forEach(reject => reject(new Error("Worker Error")));
                this.pendingResolves.clear();
                this.pendingRejects.clear();
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

        const id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            this.pendingResolves.set(id, resolve);
            this.pendingRejects.set(id, reject);

            this.worker!.postMessage({ journal, id });

            // Timeout safety
            setTimeout(() => {
                if (this.pendingResolves.has(id)) {
                    this.pendingRejects.get(id)?.(new Error("Analysis Timed Out"));
                    this.pendingResolves.delete(id);
                    this.pendingRejects.delete(id);
                }
            }, 10000);
        });
    }
}

export const aggregatorService = new AggregatorService();
