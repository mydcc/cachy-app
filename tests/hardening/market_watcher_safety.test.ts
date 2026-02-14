import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock logger before importing marketWatcher
vi.mock('../../src/services/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn()
  }
}));

import { marketWatcher } from '../../src/services/marketWatcher';
import { logger } from '../../src/services/logger';

describe('MarketWatcher Hardening', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aborts fillGaps with intervalMs=0 to prevent infinite loop (Fix Verified)', async () => {
    const klines = [
      { time: 1000, open: '1', high: '1', low: '1', close: '1', volume: '1' },
      { time: 2000, open: '2', high: '2', low: '2', close: '2', volume: '2' }
    ];

    // This call should return immediately and log an error via our mocked logger
    const filled = (marketWatcher as any).fillGaps(klines, 0);

    expect(filled.length).toBe(2);
    expect(logger.error).toHaveBeenCalledWith('market', expect.stringContaining('Invalid intervalMs'));
  });
});
