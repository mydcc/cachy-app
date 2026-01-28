/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { logger } from "./logger";

export interface QuotaEntry {
    provider: "cryptopanic" | "newsapi";
    resetDate: number;
    totalCalls: number;
    failedCalls: number;
    lastError: string | null;
    last429At: number | null;
}

const QUOTA_STORAGE_KEY = "cachy_api_quota_tracker";

function getNextMonthStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

class ApiQuotaTracker {
    // Reactive state using Runes
    quotas = $state<Record<string, QuotaEntry>>({});

    constructor() {
        if (browser) {
            this.load();
        }
    }

    private load() {
        try {
            const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
            if (raw) {
                this.quotas = JSON.parse(raw);
            }
        } catch (e) {
            logger.warn("market", `[apiQuotaTracker] Cache load failed`, e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            // $state.snapshot to get clean object
            const data = $state.snapshot(this.quotas);
            localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            logger.warn("market", `[apiQuotaTracker] Save failed`, e);
        }
    }

    logCall(provider: "cryptopanic" | "newsapi", success: boolean, errorMsg?: string) {
        // Ensure entry exists
        if (!this.quotas[provider]) {
            this.quotas[provider] = {
                provider,
                resetDate: getNextMonthStart(),
                totalCalls: 0,
                failedCalls: 0,
                lastError: null,
                last429At: null,
            };
        }

        const entry = this.quotas[provider];
        entry.totalCalls++;

        if (!success) {
            entry.failedCalls++;
            entry.lastError = errorMsg || "Unknown error";
            if (errorMsg?.includes("429") || errorMsg?.includes("quota")) {
                entry.last429At = Date.now();
                logger.warn("market", `[apiQuotaTracker] ${provider} quota exceeded (429)`);
            }
        }

        this.save();
    }

    getStats(provider: "cryptopanic" | "newsapi"): QuotaEntry | null {
        this.resetIfNeeded();
        return this.quotas[provider] || null;
    }

    isQuotaExhausted(provider: "cryptopanic" | "newsapi"): boolean {
        const stats = this.getStats(provider);
        if (!stats || !stats.last429At) return false;
        const hoursSince429 = (Date.now() - stats.last429At) / (1000 * 60 * 60);
        return hoursSince429 < 6;
    }

    resetIfNeeded() {
        const now = Date.now();
        let hasChanges = false;
        for (const key in this.quotas) {
             if (this.quotas[key].resetDate < now) {
                this.quotas[key] = {
                    ...this.quotas[key],
                    totalCalls: 0,
                    failedCalls: 0,
                    lastError: null,
                    last429At: null,
                    resetDate: getNextMonthStart()
                };
                hasChanges = true;
             }
        }
        if (hasChanges) this.save();
    }

    manualReset(provider?: "cryptopanic" | "newsapi") {
        if (provider) {
            if (this.quotas[provider]) {
                 this.quotas[provider] = {
                    ...this.quotas[provider],
                    totalCalls: 0,
                    failedCalls: 0,
                    lastError: null,
                    last429At: null
                };
                this.save();
            }
        } else {
            this.quotas = {};
            localStorage.removeItem(QUOTA_STORAGE_KEY);
        }
    }
}

export const apiQuotaTracker = new ApiQuotaTracker();
