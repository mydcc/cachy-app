import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService } from './tradeService';
import { settingsState } from '../stores/settings.svelte';

// Mock settingsState
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'key', secret: 'secret' }
        },
        appAccessToken: 'token'
    }
}));

vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn()
    }
}));

vi.mock('./toastService.svelte', () => ({
    toastService: {
        error: vi.fn()
    }
}));

describe('TradeService Validation', () => {
    const fetchPositions = (tradeService as any).fetchOpenPositionsFromApi.bind(tradeService);

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should handle API returning data: null gracefully (no crash)', async () => {
        const mockResponse = {
            code: 0,
            msg: "success",
            data: null
        };

        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify(mockResponse))
        } as Response);

        // Should NOT throw
        await expect(fetchPositions()).resolves.not.toThrow();
    });

    it('should throw controlled error if response is literal null', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve("null")
        } as Response);

        // Should throw "apiErrors.invalidResponse" instead of TypeError
        await expect(fetchPositions()).rejects.toThrow("apiErrors.invalidResponse");
    });
});
