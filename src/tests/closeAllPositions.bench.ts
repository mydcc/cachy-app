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

import { bench, describe, vi } from 'vitest';
import { tradeService } from '../services/tradeService';
import { omsService } from '../services/omsService';
import { Decimal } from 'decimal.js';

vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(() => [
            { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 }
        ])
    }
}));

vi.mock('../services/logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test' }
        }
    }
}));

describe('tradeService benchmark (Optimized)', () => {
    bench('closeAllPositions with pre-fetch', async () => {
        const origFetch = (tradeService as any)._doFetchOpenPositionsFromApi;
        const origSignedReq = (tradeService as any).signedRequest;
        try {
            (tradeService as any)._doFetchOpenPositionsFromApi = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                // Simulate that fetchOpenPositionsFromApi updates the cache correctly!
                vi.mocked(omsService.getPositions).mockReturnValue([
                    { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() },
                    { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: Date.now() },
                    { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() },
                    { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: Date.now() },
                    { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() }
                ]);
            });

            (tradeService as any).signedRequest = vi.fn().mockResolvedValue({ code: 0 });

            // Force a stale environment for the original code path:
            vi.mocked(omsService.getPositions).mockReturnValue([
                { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
                { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
                { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
                { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
                { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 }
            ]);

            await (tradeService as any).closeAllPositions();
        } finally {
            (tradeService as any)._doFetchOpenPositionsFromApi = origFetch;
            (tradeService as any).signedRequest = origSignedReq;
        }
    });
});
