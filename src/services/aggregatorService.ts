/*
 * Copyright (C) 2026 MYDCT
 *
 * Aggregator Service
 * Offloads heavy journal analysis to a Web Worker to prevent UI freezing.
 */

import { browser } from "$app/environment";
import type { JournalEntry } from "../stores/types";

class AggregatorService {
  private worker: Worker | null = null;
  private pendingResolves: Map<string, (value: any) => void> = new Map();
  private pendingRejects: Map<string, (reason?: any) => void> = new Map();

  constructor() {
    if (browser) {
      this.initWorker();
    }
  }

  private initWorker() {
    if (typeof Worker === "undefined") return;

    try {
      this.worker = new Worker(
        new URL("../workers/aggregator.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
    } catch (e) {
      console.error("[Aggregator] Failed to start worker", e);
    }
  }

  private handleMessage(e: MessageEvent) {
    const { id, success, data, error } = e.data;
    if (this.pendingResolves.has(id)) {
      if (success) {
        this.pendingResolves.get(id)?.(data);
      } else {
        this.pendingRejects.get(id)?.(new Error(error));
      }
      this.cleanup(id);
    }
  }

  private handleError(e: ErrorEvent) {
    console.error("[Aggregator] Worker Error", e);
    // Reject all pending
    this.pendingRejects.forEach((reject) => reject(new Error("Worker error")));
    this.pendingResolves.clear();
    this.pendingRejects.clear();
    // Restart logic could go here
  }

  private cleanup(id: string) {
    this.pendingResolves.delete(id);
    this.pendingRejects.delete(id);
  }

  public async analyze(journal: JournalEntry[]): Promise<any> {
    if (!this.worker) {
        // Fallback to sync if worker not available (SSR or error)
        // We assume we can import it dynamically to avoid main thread bundle bloat?
        // No, for now let's just import it.
        const { getJournalAnalysis } = await import("../lib/calculators/aggregator");
        return getJournalAnalysis(journal);
    }

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pendingResolves.set(id, resolve);
      this.pendingRejects.set(id, reject);

      this.worker!.postMessage({ id, journal });

      // Timeout
      setTimeout(() => {
        if (this.pendingResolves.has(id)) {
          this.pendingRejects.get(id)?.(new Error("Aggregator timeout"));
          this.cleanup(id);
        }
      }, 30000);
    });
  }
}

export const aggregatorService = new AggregatorService();
