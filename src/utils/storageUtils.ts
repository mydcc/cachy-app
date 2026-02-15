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

const STORAGE_USAGE_CACHE_KEY = "__storage_usage_cache__";
let cachedUsed: number | null = null;
let updateTimeout: ReturnType<typeof setTimeout> | null = null;

// Internal helper to calculate usage
function calculateUsage(): number {
  let total = 0;
  if (typeof localStorage === "undefined") return 0;

  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key === STORAGE_USAGE_CACHE_KEY) continue;
    const value = localStorage.getItem(key);
    if (value !== null) {
      total += value.length + key.length;
    }
  }
  return total;
}

// Debounced cache update
function scheduleCacheUpdate() {
  if (typeof localStorage === "undefined") return;

  if (updateTimeout) clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    if (cachedUsed !== null) {
      localStorage.setItem(STORAGE_USAGE_CACHE_KEY, cachedUsed.toString());
    }
    updateTimeout = null;
  }, 1000); // 1s debounce
}

// Initialize cache invalidation on storage events (cross-tab changes)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    // Ignore internal cache key updates
    if (event.key === STORAGE_USAGE_CACHE_KEY) return;

    if (cachedUsed === null) return;

    if (event.key === null) {
      cachedUsed = 0;
      return;
    }

    if (event.storageArea !== localStorage) return;

    const keyLen = event.key.length;
    const oldLen = event.oldValue ? event.oldValue.length + keyLen : 0;
    const newLen = event.newValue ? event.newValue.length + keyLen : 0;

    cachedUsed += newLen - oldLen;
    // We should probably verify drift here too, but simple update is fine for now.
    scheduleCacheUpdate();
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
      // Fast path: Check persistent cache
      const storedCache = localStorage.getItem(STORAGE_USAGE_CACHE_KEY);

      if (storedCache !== null) {
        const parsed = parseInt(storedCache, 10);
        if (!isNaN(parsed)) {
          cachedUsed = parsed;

          // Schedule async verification to correct any drift
          setTimeout(() => {
             const realUsage = calculateUsage();
             if (cachedUsed !== realUsage) {
               // Drift detected (e.g. from external edits or stale cache)
               console.debug(`[StorageUtils] Correcting usage cache drift: ${cachedUsed} -> ${realUsage}`);
               cachedUsed = realUsage;
               localStorage.setItem(STORAGE_USAGE_CACHE_KEY, realUsage.toString());
             }
          }, 0);

          return this._formatQuota(cachedUsed);
        }
      }

      // Slow path: Full scan (first run ever or cache missing)
      cachedUsed = calculateUsage();
      localStorage.setItem(STORAGE_USAGE_CACHE_KEY, cachedUsed.toString());
    }

    return this._formatQuota(cachedUsed);
  },

  _formatQuota(used: number) {
    // Most browsers: ~5-10MB, we assume 5MB conservative estimate
    const ESTIMATED_QUOTA = 5 * 1024 * 1024; // 5MB in bytes
    const available = Math.max(0, ESTIMATED_QUOTA - used);
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

    // Ensure cache is initialized
    const quota = this.checkQuota();
    const dataSize = value.length + key.length;

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
        scheduleCacheUpdate();
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

    // Ensure cache is initialized (so we track removals correctly)
    // Actually, if cachedUsed is null, strictly speaking we don't know the size to subtract.
    // But checkQuota() initializes it.
    // However, calling checkQuota() here is O(N) if cache missing.
    // If we are just removing, do we care?
    // Yes, for future accuracy.
    if (cachedUsed === null) {
        // If we don't have cache, we can just initialize it.
        this.checkQuota();
    }

    const oldValue = localStorage.getItem(key);
    if (oldValue !== null) {
      localStorage.removeItem(key);
      if (cachedUsed !== null) {
        cachedUsed -= key.length + oldValue.length;
        scheduleCacheUpdate();
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
    // No need to schedule update, clear removed the key too.
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
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
