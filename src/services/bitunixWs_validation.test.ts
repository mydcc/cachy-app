
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { marketState } from '../stores/market.svelte';
import { logger } from './logger';
import { mdaService } from './mdaService';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        updateSymbol: vi.fn(),
        updateDepth: vi.fn(),
        updateSymbolKlines: vi.fn(),
        updateTelemetry: vi.fn(),
        connectionStatus: 'connected'
    }
}));

vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
    }
}));

vi.mock('./mdaService', () => ({
    mdaService: {
        normalizeTicker: vi.fn((msg) => ({
             lastPrice: new Decimal(msg.data.lastPrice || 0),
             volume: new Decimal(msg.data.volume || 0),
             high: new Decimal(msg.data.high || 0),
             low: new Decimal(msg.data.low || 0),
             quoteVolume: new Decimal(msg.data.quoteVolume || 0),
             priceChangePercent: new Decimal(msg.data.priceChangePercent || 0)
        })),
        normalizeKlines: vi.fn()
    }
}));

describe('BitunixWebSocketService FastPath Hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Access private method handleMessage via explicit casting or prototype
    const handleMessage = (bitunixWs as any).handleMessage.bind(bitunixWs);

    it('should stay robust when network state is inconsistent during FastPath', () => {
        // Simulate a scenario where connection status is disconnected but message arrives (race condition)
        // Access private prop via cast
        (marketState as any).connectionStatus = 'disconnected';

        const message = {
            ch: 'ticker',
            symbol: 'BTCUSDT_RACE',
            data: { lastPrice: '60000' }
        };

        handleMessage(message, 'public');

        // Should still process if message arrived
        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT_RACE', expect.anything());
    });

    it('should ignore malformed payloads missing critical data', () => {
        const message = {
            ch: 'price',
            symbol: 'ETHUSDT_BAD',
            data: { ip: [] } // Invalid data type (array instead of string/number)
        };

        handleMessage(message, 'public');

        // Should NOT call updateSymbol because FastPath checks for ip/fr/lastPrice presence
        expect(marketState.updateSymbol).not.toHaveBeenCalled();
    });

    it('should gracefully handle unexpected nulls in numeric fields', () => {
        const message = {
            ch: 'price',
            symbol: 'SOLUSDT_NULL',
            data: {
                ip: null,
                fr: "0.001"
            }
        };

        handleMessage(message, 'public');

        // Should update funding rate but ignore index price
        expect(marketState.updateSymbol).toHaveBeenCalledWith('SOLUSDT_NULL', expect.objectContaining({
            indexPrice: undefined,
            fundingRate: expect.any(Decimal)
        }));
    });
});
