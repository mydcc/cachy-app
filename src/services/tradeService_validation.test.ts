
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { logger } from './logger';
import { tradeState } from '../stores/trade.svelte';

// Mock dependencies
vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    }
}));

// Mock settingsState
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test_key', secret: 'test_secret' }
        }
    }
}));

// Mock tradeState
vi.mock('../stores/trade.svelte', () => ({
    tradeState: {
        symbol: 'BTCUSDT'
    }
}));

// Mock omsService
vi.mock('./omsService', () => ({
    omsService: {
        getPositions: vi.fn().mockReturnValue([]),
    }
}));

describe('TradeService TP/SL Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Spy on signedRequest directly
        vi.spyOn(tradeService as any, 'signedRequest');
    });

    it('should filter out orders with invalid schema (e.g. missing triggerPrice)', async () => {
        // Arrange: Mixed valid and invalid data
        const mockApiResponse = {
            code: 0,
            msg: "success",
            data: [
                {
                    // Valid
                    orderId: "1001",
                    symbol: "BTCUSDT",
                    planType: "PROFIT",
                    triggerPrice: "50000",
                    status: "NEW"
                },
                {
                    // Invalid: Missing triggerPrice (required by Schema)
                    orderId: "1002",
                    symbol: "BTCUSDT",
                    planType: "LOSS",
                    // triggerPrice: MISSING
                    status: "NEW"
                },
                {
                    // Valid
                    orderId: "1003",
                    symbol: "ETHUSDT",
                    planType: "LOSS",
                    triggerPrice: "2000",
                    status: "NEW"
                }
            ]
        };

        // Mock the implementation of signedRequest to return our custom payload
        // Note: fetchTpSlOrders calls signedRequest multiple times (batching).
        // We mock it to return the list for any call.
        (tradeService as any).signedRequest.mockResolvedValue(mockApiResponse.data);

        // Act
        const results = await tradeService.fetchTpSlOrders();

        // Assert
        expect(results).toHaveLength(2);
        expect(results.map(o => o.orderId)).toEqual(["1001", "1003"]);

        // Verify logger was called for the invalid item
        expect(logger.warn).toHaveBeenCalledWith(
            "market",
            "[TradeService] Invalid TP/SL order dropped",
            expect.objectContaining({
                item: expect.objectContaining({ orderId: "1002" })
            })
        );
    });

    it('should handle completely malformed response gracefully', async () => {
        // Arrange: API returns null/undefined instead of array
        (tradeService as any).signedRequest.mockResolvedValue(null);

        // Act
        const results = await tradeService.fetchTpSlOrders();

        // Assert
        expect(results).toEqual([]);
    });

    it('should handle non-array response (e.g. error object masked as success)', async () => {
        // Arrange
        (tradeService as any).signedRequest.mockResolvedValue({ some: "object" });

        // Act
        const results = await tradeService.fetchTpSlOrders();

        // Assert
        expect(results).toEqual([]);
    });

    it('should validate numeric strings correctly', async () => {
         const mockApiResponse = [
                {
                    // Valid with numeric string
                    orderId: 123456, // Schema transforms to string
                    symbol: "BTCUSDT",
                    planType: "PROFIT",
                    triggerPrice: 50000.50, // Schema transforms to string
                    status: "NEW"
                }
         ];
         (tradeService as any).signedRequest.mockResolvedValue(mockApiResponse);

         const results = await tradeService.fetchTpSlOrders();

         expect(results).toHaveLength(1);
         expect(results[0].orderId).toBe("123456"); // Transformed
         expect(results[0].triggerPrice).toBe("50000.5"); // Transformed
    });
});
