/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { uiState } from "../stores/ui.svelte";

export interface StorageStats {
  used: number;
  quota: number;
  percentUsed: number;
}

/**
 * Helper utility for safe localStorage operations with quota handling
 */
export class StorageHelper {
  /**
   * Safely saves to localStorage with automatic quota handling
   * @param key Storage key
   * @param data Data to save (as string)
   * @returns true if save was successful, false otherwise
   */
  static safeSave(key: string, data: string): boolean {
    try {
      localStorage.setItem(key, data);
      return true;
    } catch (e: any) {
      if (e.name === "QuotaExceededError") {
        console.error("[Storage] Quota exceeded for key:", key);

        // 1. Notify user
        uiState.showError("storage.quotaExceeded");

        // 2. Try to cleanup old cache
        this.cleanupCache();

        // 3. Retry after cleanup
        try {
          localStorage.setItem(key, data);
          console.warn("[Storage] Retry successful after cleanup");
          return true;
        } catch (retryError) {
          console.error("[Storage] Retry failed after cleanup:", retryError);
          return false;
        }
      } else {
        console.error("[Storage] Save failed with unexpected error:", e);
        throw e;
      }
    }
  }

  /**
   * Cleanup old cache entries to free up space
   */
  static cleanupCache(): void {
    const cacheKeys = [
      "cachy_news_cache",
      "cachy_sentiment_cache",
      "cachy_settings_backup",
    ];

    let freedSpace = 0;

    for (const key of cacheKeys) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          const size = new Blob([value]).size;
          localStorage.removeItem(key);
          freedSpace += size;
          console.warn(
            `[Storage] Removed cache: ${key} (${(size / 1024).toFixed(2)}KB)`,
          );
        }
      } catch (e) {
        console.warn(`[Storage] Failed to remove ${key}:`, e);
      }
    }

    if (freedSpace > 0) {
      console.warn(
        `[Storage] Total freed: ${(freedSpace / 1024).toFixed(2)}KB`,
      );
    }
  }

  /**
   * Get storage usage statistics
   * @returns Storage stats with used/quota/percentUsed
   */
  static async getStats(): Promise<StorageStats> {
    // Try modern Storage API first
    if ("storage" in navigator && "estimate" in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentUsed: estimate.quota
            ? ((estimate.usage || 0) / estimate.quota) * 100
            : 0,
        };
      } catch (e) {
        console.warn("[Storage] Failed to get estimate:", e);
      }
    }

    // Fallback: Calculate based on stored data
    let totalSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          // UTF-16 encoding: 2 bytes per character
          totalSize += (key.length + (value?.length || 0)) * 2;
        }
      }
    } catch (e) {
      console.warn("[Storage] Failed to calculate size:", e);
    }

    // Assume 10MB default quota (conservative estimate)
    const defaultQuota = 10 * 1024 * 1024;

    return {
      used: totalSize,
      quota: defaultQuota,
      percentUsed: (totalSize / defaultQuota) * 100,
    };
  }

  /**
   * Check if storage is near quota threshold
   * @param threshold Percentage threshold (default: 80%)
   * @returns true if usage is above threshold
   */
  static async isNearQuota(threshold: number = 80): Promise<boolean> {
    const stats = await this.getStats();
    return stats.percentUsed > threshold;
  }

  /**
   * Get human-readable storage stats
   */
  static async getStatsFormatted(): Promise<string> {
    const stats = await this.getStats();
    const usedMB = (stats.used / (1024 * 1024)).toFixed(2);
    const quotaMB = (stats.quota / (1024 * 1024)).toFixed(2);
    return `${usedMB}MB / ${quotaMB}MB (${stats.percentUsed.toFixed(1)}%)`;
  }
}
