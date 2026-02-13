
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService, TradeError, TRADE_ERRORS } from './tradeService';
import { omsService } from './omsService';
import { settingsState } from '../stores/settings.svelte';
import { logger } from './logger';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test' }
        },
        appAccessToken: 'token'
    }
}));

vi.mock('./omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        updateOrder: vi.fn(),
        updatePosition: vi.fn()
    }
}));

vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock marketState
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {}
    }
}));

describe('TradeService Validation & Error Handling', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should throw tradeErrors.positionNotFound when flashing close a missing position', async () => {
        // Setup: OMS returns empty positions
        (omsService.getPositions as any).mockReturnValue([]);

        // Setup: fetch fallback also fails to find position (returns empty list)
        (global.fetch as any).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify({ code: 0, data: [] }))
        });

        await expect(tradeService.flashClosePosition('BTCUSDT', 'long'))
            .rejects.toThrow('tradeErrors.positionNotFound');
    });

    it('should throw trade.closeAbortedSafety when cancelAllOrders fails during flash close', async () => {
        // Setup: Position exists
        const mockPos = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(10),
            lastUpdated: Date.now()
        };
        (omsService.getPositions as any).mockReturnValue([mockPos]);

        // Mock cancelAllOrders to fail (simulating signedRequest failure)
        // We spy on signedRequest. Note: signedRequest is public/protected in the class?
        // It's public in the file I read.

        // Mock fetch for cancel order to fail
        (global.fetch as any).mockImplementation(async (url: string, init: any) => {
            if (url.includes('/api/orders') && init.body.includes('cancel-all')) {
                return {
                    ok: false,
                    text: () => Promise.resolve('Cancel Failed'),
                    status: 500
                };
            }
            return {
                ok: true,
                text: () => Promise.resolve(JSON.stringify({ code: 0, data: {} }))
            };
        });

        await expect(tradeService.flashClosePosition('BTCUSDT', 'long'))
            .rejects.toThrow('trade.closeAbortedSafety');

        expect(logger.error).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('CRITICAL: Failed to cancel open orders'),
            expect.anything()
        );
    });

    it('should throw trade.apiError when fetchOpenPositionsFromApi encounters an API error', async () => {
        // We force access to private method via a public method that calls it,
        // OR we just test the method if we cast to any.
        // flashClosePosition calls ensurePositionFreshness which calls fetchOpenPositionsFromApi if stale/missing.

        (omsService.getPositions as any).mockReturnValue([]);

        // Mock API error response
        (global.fetch as any).mockResolvedValue({
            ok: true, // HTTP OK but API error code in body logic?
            // Actually fetchOpenPositionsFromApi checks pendingResult.error
            text: () => Promise.resolve(JSON.stringify({
                error: "Some API Error",
                code: 10001
            }))
        });

        // This will trigger ensurePositionFreshness -> fetchOpenPositionsFromApi
        // which throws TradeError(error, "trade.apiError")
        try {
            await tradeService.flashClosePosition('BTCUSDT', 'long');
        } catch (e: any) {
            expect(e.name).toBe('TradeError');
            expect(e.code).toBe('trade.apiError');
            expect(e.message).toBe('Some API Error');
        }
    });
});
