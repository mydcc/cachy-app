/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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

    it('should use Fast Path for valid price message (Price Channel updates Funding/Index)', () => {
        const msg = {
            ch: 'price',
            symbol: 'BTCUSDT',
            data: { lastPrice: '50000', fr: '0.01', ip: '50001' }
        };

        wsService.handleMessage(msg, 'public');

        // Price channel now updates Index Price and Funding Rate, NOT Last Price (to avoid flickering)
        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({
            fundingRate: '0.01',
            indexPrice: '50001'
        }));
    });

    it('should use Fast Path for valid ticker message (Ticker Channel updates LastPrice)', () => {
        const msg = {
            ch: 'ticker',
            symbol: 'BTCUSDT',
            data: { lastPrice: '50000', volume: '1000' }
        };

        wsService.handleMessage(msg, 'public');

        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({
            lastPrice: '100' // From mock
        }));
    });

    it('should handle topic alias for channel', () => {
        const msg = {
            topic: 'ticker', // Using topic instead of ch
            symbol: 'SOLUSDT',
            data: { lastPrice: '150' }
        };

        wsService.handleMessage(msg, 'public');

        expect(marketState.updateSymbol).toHaveBeenCalledWith('SOLUSDT', expect.objectContaining({
            lastPrice: '100' // From mock
        }));
    });

    it('should FALLBACK to standard validation if Fast Path throws (using Ticker channel)', () => {
        // Force throw in fast path
        const normalizeMock = vi.mocked(mdaService.normalizeTicker);
        normalizeMock.mockImplementationOnce(() => {
            throw new Error('Fast Path Crash');
        });

        // Use different symbol or clear throttle (done in beforeEach)
        const msg = {
            ch: 'ticker', // Must use Ticker to trigger normalizeTicker in Fast Path
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
