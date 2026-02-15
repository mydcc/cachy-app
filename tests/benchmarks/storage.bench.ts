// @vitest-environment happy-dom
import { bench, describe } from 'vitest';
import { storageUtils } from '../../src/utils/storageUtils';

describe('storageUtils', () => {
  // Setup data once
  const setupStorage = (count: number) => {
    localStorage.clear();
    storageUtils.clear();

    for (let i = 0; i < count; i++) {
      localStorage.setItem(`key-${i}`, 'x'.repeat(100));
    }
  };

  const evt = new StorageEvent('storage', {
        key: 'key-0',
        oldValue: 'x'.repeat(100),
        newValue: 'x'.repeat(101),
        storageArea: localStorage
  });

  bench('checkQuota warm cache', () => {
    storageUtils.checkQuota();
  }, {
    time: 100,
    setup: () => {
      setupStorage(1000);
      storageUtils.checkQuota(); // Ensure warm
    }
  });

  bench('checkQuota after storage event', () => {
    // We intentionally invalidate cache every time to measure the cost of handling the event + re-check
    window.dispatchEvent(evt);
    storageUtils.checkQuota();
  }, {
    time: 100,
    setup: () => {
      setupStorage(1000);
    }
  });
});
