/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { logger } from "./logger";

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function safeReadCache<T>(key: string): T | null {
    if (!isBrowser) return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch (e) {
        try {
            localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
        logger.warn("market", `[apiQuotaTracker] Corrupted cache cleared for ${key}`);
        return null;
    }
}

function safeWriteCache<T>(key: string, value: T) {
    if (!isBrowser) return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        logger.warn("market", `[apiQuotaTracker] Failed to persist ${key}`);
    }
}

export interface QuotaEntry {
    provider: "cryptopanic" | "newsapi";
    resetDate: number; // Timestamp des nächsten Resets
    totalCalls: number;
    failedCalls: number;
    lastError: string | null;
    last429At: number | null; // Timestamp des letzten 429-Errors
}

const QUOTA_STORAGE_KEY = "cachy_api_quota_tracker";

function getNextMonthStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

export const apiQuotaTracker = {
    /**
     * Protokolliert einen API-Call
     */
    logCall(provider: "cryptopanic" | "newsapi", success: boolean, errorMsg?: string) {
        const quota = safeReadCache<Record<string, QuotaEntry>>(QUOTA_STORAGE_KEY) || {};
        const now = Date.now();

        if (!quota[provider]) {
            quota[provider] = {
                provider,
                resetDate: getNextMonthStart(),
                totalCalls: 0,
                failedCalls: 0,
                lastError: null,
                last429At: null,
            };
        }

        quota[provider].totalCalls++;

        if (!success) {
            quota[provider].failedCalls++;
            quota[provider].lastError = errorMsg || "Unknown error";

            // Track 429 errors specifically
            if (errorMsg?.includes("429") || errorMsg?.includes("quota")) {
                quota[provider].last429At = now;
                logger.warn("market", `[apiQuotaTracker] ${provider} quota exceeded (429)`);
            }
        }

        safeWriteCache(QUOTA_STORAGE_KEY, quota);
    },

    /**
     * Gibt Statistiken für einen Provider zurück
     */
    getStats(provider: "cryptopanic" | "newsapi"): QuotaEntry | null {
        this.resetIfNeeded();
        const quota = safeReadCache<Record<string, QuotaEntry>>(QUOTA_STORAGE_KEY);
        return quota?.[provider] || null;
    },

    /**
     * Prüft, ob Quota erschöpft ist (basierend auf 429-Errors)
     */
    isQuotaExhausted(provider: "cryptopanic" | "newsapi"): boolean {
        const stats = this.getStats(provider);
        if (!stats || !stats.last429At) return false;

        const now = Date.now();
        const hoursSince429 = (now - stats.last429At) / (1000 * 60 * 60);

        // Wenn letzter 429-Error < 6h her, als erschöpft markieren
        return hoursSince429 < 6;
    },

    /**
     * Resettet Statistiken wenn Monat vorbei ist
     */
    resetIfNeeded() {
        const quota = safeReadCache<Record<string, QuotaEntry>>(QUOTA_STORAGE_KEY);
        if (!quota) return;

        const now = Date.now();
        let hasChanges = false;

        Object.keys(quota).forEach((key) => {
            if (quota[key].resetDate < now) {
                quota[key].totalCalls = 0;
                quota[key].failedCalls = 0;
                quota[key].lastError = null;
                quota[key].last429At = null;
                quota[key].resetDate = getNextMonthStart();
                hasChanges = true;
                console.log(`[apiQuotaTracker] Reset quota for ${key}`);
            }
        });

        if (hasChanges) {
            safeWriteCache(QUOTA_STORAGE_KEY, quota);
        }
    },

    /**
     * Manueller Reset (für Tests/Admin)
     */
    manualReset(provider?: "cryptopanic" | "newsapi") {
        if (provider) {
            const quota = safeReadCache<Record<string, QuotaEntry>>(QUOTA_STORAGE_KEY) || {};
            if (quota[provider]) {
                quota[provider].totalCalls = 0;
                quota[provider].failedCalls = 0;
                quota[provider].lastError = null;
                quota[provider].last429At = null;
                safeWriteCache(QUOTA_STORAGE_KEY, quota);
            }
        } else {
            localStorage.removeItem(QUOTA_STORAGE_KEY);
        }
        console.log(`[apiQuotaTracker] Manual reset for ${provider || "all"}`);
    },
};
