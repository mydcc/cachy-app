import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from './marketWatcher';

vi.mock('$app/environment', () => ({ browser: false }));
vi.stubGlobal('window', { indexedDB: {}, location: { hostname: 'localhost' } });
vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() });

describe('MarketWatcher Hardening', () => {
    beforeEach(() => {
        marketWatcher.forceCleanup();
    });

    it('destroy() safely cleans historyLocks', () => {
        const mw: any = marketWatcher;
        mw.historyLocks.add("lock");

        mw.destroy();

        expect(mw.historyLocks.size).toBe(0);
    });
});
