/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CACHE_KEY = "__storage_usage_cache__";

describe('storageUtils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getStorageUtils() {
      // Dynamic import to reload module and simulate fresh state (cachedUsed = null)
      const mod = await import('./storageUtils');
      return mod.storageUtils;
  }

  it('should calculate quota correctly on first run (slow path fallback)', async () => {
    // Populate storage before module load
    localStorage.setItem('k1', 'v1'); // 4 bytes total

    const storageUtils = await getStorageUtils();

    // Should scan and return correct usage
    const quota = storageUtils.checkQuota();
    expect(quota.used).toBe(4);

    // Should persist cache immediately
    expect(localStorage.getItem(CACHE_KEY)).toBe("4");
  });

  it('should use persistent cache on startup (fast path)', async () => {
    // Populate storage and valid cache key
    localStorage.setItem('k1', 'v1'); // 4 bytes
    localStorage.setItem(CACHE_KEY, '4');

    const storageUtils = await getStorageUtils();

    // checkQuota should use cache immediately
    const quota = storageUtils.checkQuota();
    expect(quota.used).toBe(4);
  });

  it('should correct drift via async verification on startup', async () => {
    // Setup state: Cache says 4, but actual is 8 (drift)
    localStorage.setItem('k1', 'v1'); // 4
    localStorage.setItem('k2', 'v2'); // 4 -> Total 8
    localStorage.setItem(CACHE_KEY, '4'); // Stale cache

    const storageUtils = await getStorageUtils();

    // Immediate check returns stale cache (Optimistic)
    const quota = storageUtils.checkQuota();
    expect(quota.used).toBe(4);

    // Run async verification
    vi.runAllTimers();

    // Verification should update internal cache AND persistent cache
    expect(storageUtils.checkQuota().used).toBe(8);
    expect(localStorage.getItem(CACHE_KEY)).toBe("8");
  });

  it('should update persistent cache on write (debounced)', async () => {
    const storageUtils = await getStorageUtils();

    // Initial check (populates cache)
    storageUtils.checkQuota();

    // Write new data
    storageUtils.safeSetItem('k1', 'v1'); // 4

    // Internal cache updates immediately
    expect(storageUtils.checkQuota().used).toBe(4);

    // Persistent cache update is debounced (pending)
    // Run timers to flush update
    vi.runAllTimers();

    expect(localStorage.getItem(CACHE_KEY)).toBe("4");

    // Write more data
    storageUtils.safeSetItem('k2', 'v2'); // Total 8
    expect(storageUtils.checkQuota().used).toBe(8);

    vi.runAllTimers();
    expect(localStorage.getItem(CACHE_KEY)).toBe("8");
  });

  it('should handle quota exceeded errors correctly', async () => {
    const storageUtils = await getStorageUtils();
    const ESTIMATED_QUOTA = 5 * 1024 * 1024;
    const bigValue = 'a'.repeat(ESTIMATED_QUOTA + 1);

    expect(() => {
      storageUtils.safeSetItem('big', bigValue);
    }).toThrow(/Quota überschritten/);

    // Cache should remain valid (0 usage)
    expect(storageUtils.checkQuota().used).toBe(0);
  });

  it('should ignore CACHE_KEY self-usage', async () => {
      // Manually set usage without cache key
      localStorage.setItem('k1', 'v1'); // 4

      const storageUtils = await getStorageUtils();

      // Should calculate 4, ignoring the cache key itself (which is created during checkQuota)
      const quota = storageUtils.checkQuota();
      expect(quota.used).toBe(4);

      // Verify cache key exists now
      expect(localStorage.getItem(CACHE_KEY)).toBe("4");

      // Verify subsequent check remains consistent
      vi.runAllTimers();
      expect(storageUtils.checkQuota().used).toBe(4);
  });
});
