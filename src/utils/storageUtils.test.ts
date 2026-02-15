import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageUtils } from './storageUtils';

describe('storageUtils', () => {
  beforeEach(() => {
    localStorage.clear();
    storageUtils.clear();
    vi.clearAllMocks();
  });

  it('should correctly calculate quota', () => {
    storageUtils.safeSetItem('testKey', 'testValue');
    const quota = storageUtils.checkQuota();

    // key.length (7) + testValue.length (9) = 16
    expect(quota.used).toBe(16);
    expect(quota.available).toBe(5 * 1024 * 1024 - 16);
    expect(quota.percentage).toBe((16 / (5 * 1024 * 1024)) * 100);
  });

  it('should update cache incrementally on safeSetItem', () => {
    storageUtils.safeSetItem('k1', 'v1'); // 2 + 2 = 4
    expect(storageUtils.checkQuota().used).toBe(4);

    storageUtils.safeSetItem('k1', 'v123'); // 2 + 4 = 6
    expect(storageUtils.checkQuota().used).toBe(6);

    storageUtils.safeSetItem('k2', 'v2'); // 6 + (2 + 2) = 10
    expect(storageUtils.checkQuota().used).toBe(10);
  });

  it('should update cache on removeItem', () => {
    storageUtils.safeSetItem('k1', 'v1');
    storageUtils.safeSetItem('k2', 'v2');
    expect(storageUtils.checkQuota().used).toBe(8);

    storageUtils.removeItem('k1');
    expect(storageUtils.checkQuota().used).toBe(4);

    storageUtils.removeItem('k2');
    expect(storageUtils.checkQuota().used).toBe(0);
  });

  it('should reset cache on clear', () => {
    storageUtils.safeSetItem('k1', 'v1');
    expect(storageUtils.checkQuota().used).toBe(4);

    storageUtils.clear();
    expect(storageUtils.checkQuota().used).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('should handle quota exceeded', () => {
    const ESTIMATED_QUOTA = 5 * 1024 * 1024;
    const bigValue = 'a'.repeat(ESTIMATED_QUOTA + 1);

    expect(() => {
      storageUtils.safeSetItem('big', bigValue);
    }).toThrow(/Quota überschritten/);
  });

  it('should invalidate cache on storage event', () => {
    storageUtils.safeSetItem('k1', 'v1');
    expect(storageUtils.checkQuota().used).toBe(4);

    // Modify localStorage directly (simulating another tab)
    localStorage.setItem('k2', 'v2');

    // Trigger storage event
    window.dispatchEvent(new Event('storage'));

    // checkQuota should now re-calculate and find both items
    // k1 (4) + k2 (4) = 8
    expect(storageUtils.checkQuota().used).toBe(8);
  });
});
