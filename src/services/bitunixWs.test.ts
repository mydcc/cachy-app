import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from '../../src/services/bitunixWs';
import { marketState } from '../../src/stores/market.svelte';
import { mdaService } from '../../src/services/mdaService';

// Mock mdaService
vi.mock('../../src/services/mdaService', () => ({
    mdaService: {
        normalizeTicker: vi.fn(() => ({ lastPrice: '100', high: '105', low: '95', volume: '1000' })),
        normalizeKlines: vi.fn(() => [])
    }
}));

// Mock logger
vi.mock('../../src/services/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn()
    }
}));

// Mock marketState
vi.mock('../../src/stores/market.svelte', () => ({
    marketState: {
        updateSymbol: vi.fn(),
        updateDepth: vi.fn(),
        updateSymbolKlines: vi.fn(),
        updateTelemetry: vi.fn(),
        connectionStatus: 'connected'
    }
}));

describe('BitunixWS Fast Path Fallback', () => {
    const wsService = bitunixWs as any;

    beforeEach(() => {
        vi.clearAllMocks();
        // Clear throttle map to prevent cross-test contamination
        if (wsService.throttleMap) {
            wsService.throttleMap.clear();
        }
    });

    it('should use Fast Path for valid price message', () => {
        const msg = {
            ch: 'price',
            symbol: 'BTCUSDT',
            data: { lastPrice: '50000', fr: '0.01' }
        };

        wsService.handleMessage(msg, 'public');

        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({ lastPrice: '100' }));
    });

    it('should FALLBACK to standard validation if Fast Path throws', () => {
        // Force throw in fast path
        const normalizeMock = vi.mocked(mdaService.normalizeTicker);
        normalizeMock.mockImplementationOnce(() => {
            throw new Error('Fast Path Crash');
        });

        // Use different symbol or clear throttle (done in beforeEach)
        const msg = {
            ch: 'price',
            symbol: 'ETHUSDT',
            data: { lastPrice: '3000' },
            event: 'push' // Valid structure for Zod fallback
        };

        // Execution
        wsService.handleMessage(msg, 'public');

        // Verification:
        // 1. Fast Path called normalizeTicker -> Threw Error
        // 2. Catch block caught it
        // 3. Fallback logic (Zod) ran -> Called normalizeTicker AGAIN (success)
        // 4. updateSymbol called with success result

        expect(normalizeMock).toHaveBeenCalledTimes(2);
        expect(marketState.updateSymbol).toHaveBeenCalledWith('ETHUSDT', expect.any(Object));
    });

    it('should handle missing fields in Fast Path gracefully without crashing', () => {
        const msg = {
            ch: 'price',
            symbol: 'SOLUSDT',
            data: { random: 'field' },
            event: 'push'
        };

        wsService.handleMessage(msg, 'public');
        expect(true).toBe(true);
    });
});
