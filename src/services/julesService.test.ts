import { describe, it, expect, vi } from 'vitest';
import { julesService } from './julesService';
import { get } from 'svelte/store';

// Mock Stores
vi.mock('../stores/settingsStore', () => ({
    settingsStore: {
        subscribe: (fn: any) => {
            fn({ apiKeys: { bitunix: { apiKey: '123', apiSecret: 'secret' } } });
            return () => {};
        }
    }
}));

vi.mock('../stores/tradeStore', () => ({
    tradeStore: {
        subscribe: (fn: any) => {
            fn({ symbol: 'BTCUSDT', takeProfitTargets: [] });
            return () => {};
        }
    }
}));

vi.mock('../stores/uiStore', () => ({
    uiStore: {
        subscribe: (fn: any) => {
            fn({ theme: 'dark' });
            return () => {};
        }
    }
}));

vi.mock('../stores/accountStore', () => ({
    accountStore: {
        subscribe: (fn: any) => {
            fn({ positions: [], openOrders: [] });
            return () => {};
        }
    }
}));

vi.mock('../stores/marketStore', () => ({
    marketStore: {
        subscribe: (fn: any) => {
            fn({ wsStatus: 'connected' });
            return () => {};
        }
    }
}));

// Mock Fetch
global.fetch = vi.fn();

describe('julesService', () => {
    it('should create a sanitized snapshot', () => {
        const snapshot = julesService.getSystemSnapshot();

        expect(snapshot.settings.apiKeys.bitunix.apiSecret).toBe('***REDACTED***');
        expect(snapshot.tradeState.symbol).toBe('BTCUSDT');
    });

    it('should send a report to the API', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ message: 'Success' })
        });

        const result = await julesService.reportToJules(null, 'MANUAL');
        expect(result).toBe('Success');
        expect(global.fetch).toHaveBeenCalledWith('/api/jules', expect.anything());
    });
});
