
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
        normalizeTicker: vi.fn(),
        normalizeKlines: vi.fn()
    }
}));

describe('BitunixWebSocketService FastPath Hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset throttle map indirectly by using unique symbols
    });

    // Access private method handleMessage via explicit casting or prototype
    const handleMessage = (bitunixWs as any).handleMessage.bind(bitunixWs);

    it('should correctly process numeric price data in FastPath', () => {
        // Arrange: Message with numeric values (API drift scenario)
        const message = {
            ch: 'price',
            symbol: 'BTCUSDT_VALID', // Unique symbol to avoid throttle
            data: {
                ip: 95000.50,       // Number
                fr: 0.0001,         // Number
                nft: 1700000000000, // Number (timestamp)
                lastPrice: 95000.50 // Number
            }
        };

        // Act
        handleMessage(message, 'public');

        // Assert
        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT_VALID', expect.objectContaining({
            indexPrice: expect.any(Decimal),
            fundingRate: expect.any(Decimal),
            nextFundingTime: 1700000000000
        }));

        // Verify conversion correctness
        const callArgs = (marketState.updateSymbol as any).mock.calls[0][1];
        expect(callArgs.indexPrice.toString()).toBe('95000.5');
        expect(callArgs.fundingRate.toString()).toBe('0.0001');
    });

    it('should log warning when FastPath fails (simulated)', () => {
        // Arrange: Malformed data that might cause Decimal constructor to throw if not handled
        const message = {
            ch: 'price',
            symbol: 'BTCUSDT_ERROR',
            data: { ip: "invalid" }
        };

        // Make updateSymbol throw to trigger the catch block in FastPath
        (marketState.updateSymbol as any).mockImplementationOnce(() => {
            throw new Error("Simulated Store Error");
        });

        // Act
        handleMessage(message, 'public');

        // Assert
        expect(logger.warn).toHaveBeenCalledWith(
            "network",
            "[BitunixWS] FastPath error (price)",
            expect.any(Error)
        );
    });

    it('should handle numeric ticker data in FastPath', () => {
         const message = {
            ch: 'ticker',
            symbol: 'ETHUSDT_TICKER',
            data: {
                lastPrice: 3000.50, // Number
                volume: 50000,      // Number
                high: 3100,
                low: 2900
            }
        };

        // Mock normalization to return something valid
        (mdaService.normalizeTicker as any).mockReturnValue({
            lastPrice: new Decimal(3000.5),
            volume: new Decimal(50000),
            high: new Decimal(3100),
            low: new Decimal(2900),
            quoteVolume: new Decimal(0),
            priceChangePercent: new Decimal(0)
        });

        handleMessage(message, 'public');

        expect(mdaService.normalizeTicker).toHaveBeenCalled();
        expect(marketState.updateSymbol).toHaveBeenCalledWith('ETHUSDT_TICKER', expect.anything());
    });
});
