
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

    it('should warn on unsafe integer precision loss', () => {
        const unsafeInt = 9007199254740995; // > MAX_SAFE_INTEGER
        const message = {
            ch: 'price',
            symbol: 'BTCUSDT_PRECISION',
            data: {
                ip: unsafeInt,
                fr: 0.0001
            }
        };

        handleMessage(message, 'public');

        expect(logger.warn).toHaveBeenCalledWith(
            "network",
            expect.stringContaining("PRECISION LOSS")
        );
    });

    it('should log warning when FastPath fails (simulated)', () => {
        // Arrange: Malformed data that might cause Decimal constructor to throw if not handled
        // We force a throw inside updateSymbol to simulate a runtime error during the FastPath block
        const message = {
            ch: 'price',
            symbol: 'BTCUSDT_ERROR',
            data: { ip: "valid_string_but_logic_fails" }
        };

        // Make updateSymbol throw to trigger the catch block in FastPath
        (marketState.updateSymbol as any).mockImplementationOnce(() => {
            throw new Error("Simulated Store Error");
        });

        // Act
        handleMessage(message, 'public');

        // Assert: It should catch and log warning, NOT crash
        expect(logger.warn).toHaveBeenCalledWith(
            "network",
            expect.stringContaining("FastPath Exception"),
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
                low: 2900,
                quoteVolume: 150000000,
                priceChangePercent: 5.5
            }
        };

        handleMessage(message, 'public');

        expect(mdaService.normalizeTicker).toHaveBeenCalled();
        // Check that normalization received strings
        const normalizeCall = (mdaService.normalizeTicker as any).mock.calls[0][0];
        // The message object passed to normalizeTicker should have been mutated or a new one created with strings
        // FastPath mutates data in place!
        expect(typeof normalizeCall.data.lastPrice).toBe('string');
        expect(normalizeCall.data.lastPrice).toBe('3000.5');

        expect(marketState.updateSymbol).toHaveBeenCalledWith('ETHUSDT_TICKER', expect.anything());
    });
});
