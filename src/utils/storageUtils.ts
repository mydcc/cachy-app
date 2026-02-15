/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * LocalStorage Utility Functions
 * Provides safe storage operations with quota checking
 */

let cachedUsed: number | null = null;

// Initialize cache invalidation on storage events (cross-tab changes)
if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    cachedUsed = null;
  });
}

export const storageUtils = {
  /**
   * Checks available LocalStorage space
   * @returns Object with used bytes, available bytes, and percentage
   */
  checkQuota(): { used: number; available: number; percentage: number } {
    if (typeof localStorage === "undefined") {
      return { used: 0, available: 5 * 1024 * 1024, percentage: 0 };
    }

    if (cachedUsed === null) {
      let total = 0;
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          total += value.length + key.length;
        }
      }
      cachedUsed = total;
    }

    const used = cachedUsed;
    // Most browsers: ~5-10MB, we assume 5MB conservative estimate
    const ESTIMATED_QUOTA = 5 * 1024 * 1024; // 5MB in bytes
    const available = ESTIMATED_QUOTA - used;
    const percentage = (used / ESTIMATED_QUOTA) * 100;

    return { used, available, percentage };
  },

  /**
   * Safely stores data in LocalStorage with quota validation
   * @param key - Storage key
   * @param value - String value to store
   * @throws Error if quota would be exceeded
   */
  safeSetItem(key: string, value: string): void {
    if (typeof localStorage === "undefined") return;

    const dataSize = value.length + key.length;
    const quota = this.checkQuota();

    // Warning at >80% usage
    if (quota.percentage > 80) {
      console.warn(
        `LocalStorage ist zu ${quota.percentage.toFixed(1)}% voll (${(
          quota.used / 1024
        ).toFixed(0)}KB von ${((quota.used + quota.available) / 1024).toFixed(
          0,
        )}KB)`,
      );
    }

    // Error at >95% or if new data doesn't fit
    if (quota.percentage > 95 || dataSize > quota.available) {
      throw new Error(
        `LocalStorage Quota überschritten. ` +
          `Verwendet: ${(quota.used / 1024).toFixed(0)}KB / ${(
            (quota.used + quota.available) /
            1024
          ).toFixed(0)}KB. ` +
          `Bitte löschen Sie alte Trades oder exportieren Sie Ihr Journal.`,
      );
    }

    try {
      const oldValue = localStorage.getItem(key);
      localStorage.setItem(key, value);

      // Incremental cache update
      if (cachedUsed !== null) {
        if (oldValue !== null) {
          cachedUsed += value.length - oldValue.length;
        } else {
          cachedUsed += key.length + value.length;
        }
      }
    } catch (e) {
      // QuotaExceededError or other storage errors
      if (e instanceof Error && e.name === "QuotaExceededError") {
        throw new Error(
          "LocalStorage ist voll. Bitte exportieren Sie Ihr Journal als CSV und löschen Sie alte Einträge.",
        );
      }
      throw new Error(
        "Fehler beim Speichern. Der lokale Speicher ist möglicherweise blockiert.",
      );
    }
  },

  /**
   * Safely removes data from LocalStorage and updates cache
   * @param key - Storage key
   */
  removeItem(key: string): void {
    if (typeof localStorage === "undefined") return;

    const oldValue = localStorage.getItem(key);
    if (oldValue !== null) {
      localStorage.removeItem(key);
      if (cachedUsed !== null) {
        cachedUsed -= key.length + oldValue.length;
      }
    }
  },

  /**
   * Clears all LocalStorage data and resets cache
   */
  clear(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.clear();
    cachedUsed = 0;
  },

  /**
   * Gets formatted quota information for display
   * @returns Human-readable quota status string
   */
  getQuotaStatus(): string {
    const quota = this.checkQuota();
    return `LocalStorage: ${(quota.used / 1024).toFixed(0)}KB / ${(
      (quota.used + quota.available) /
      1024
    ).toFixed(0)}KB (${quota.percentage.toFixed(1)}%)`;
  },
};
