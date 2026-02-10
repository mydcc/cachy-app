import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { marketState } from '../stores/market.svelte';

// Mock marketState
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        updateSymbol: vi.fn(),
        updateDepth: vi.fn(),
        updateSymbolKlines: vi.fn(),
        updateTelemetry: vi.fn(),
        connectionStatus: 'connected',
        telemetry: { activeConnections: 0 }
    }
}));

describe('BitunixWS Fast Path Robustness', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle numeric price in Fast Path by stringifying it', () => {
        const payload = {
            ch: 'price',
            symbol: 'SYM1',
            data: {
                ip: 50000.123, // Numeric
                fr: '0.0001'
            }
        };

        (bitunixWs as any).handleMessage(payload, 'public');

        expect(marketState.updateSymbol).toHaveBeenCalledWith('SYM1USDT', expect.objectContaining({
            indexPrice: expect.any(Object), // Decimal
            fundingRate: expect.any(Object)
        }));
    });

    it('should SKIP Fast Path and Fallback to Zod if data is unsafe object', () => {
        const payload = {
            ch: 'price',
            symbol: 'SYM2',
            data: {
                ip: { bad: true }, // Unsafe object
                fr: '0.0001'
            }
        };

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        (bitunixWs as any).handleMessage(payload, 'public');

        // Fast path sees unsafe object -> converts to undefined/skips?
        // With my fix: ip becomes undefined. fr is valid. updateSymbol IS called.
        // Wait, if I WANT it to be called (robustness), then expectation should be toHaveBeenCalled.
        // But the Zod fallback uses BitunixPriceDataSchema.
        // BitunixPriceDataSchema expects string|number. {bad:true} fails Zod.
        // So Zod fallback should fail.
        // So updateSymbol should NOT be called.

        expect(marketState.updateSymbol).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should catch error INSIDE Fast Path if Decimal creation fails', () => {
        const payload = {
            ch: 'price',
            symbol: 'SYM3',
            data: {
                ip: "invalid-number", // String is "safe" by isSafe, but invalid for Decimal
                fr: '0.0001'
            }
        };

        (bitunixWs as any).handleMessage(payload, 'public');

        // Should fall back to standard path
        expect(marketState.updateSymbol).toHaveBeenCalledWith('SYM3USDT', expect.anything());
    });
});
