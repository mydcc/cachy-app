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
import type { OMSPosition } from '../services/omsTypes';
import { Decimal } from 'decimal.js';

// Fills the OMSPosition fields this benchmark doesn't vary (entryPrice,
// unrealizedPnl, leverage, marginMode) with inert defaults.
function mkPosition(symbol: string, side: OMSPosition["side"], lastUpdated: number): OMSPosition {
    return {
        symbol,
        side,
        amount: new Decimal('1'),
        entryPrice: new Decimal('0'),
        unrealizedPnl: new Decimal('0'),
        leverage: new Decimal('1'),
        marginMode: 'cross',
        lastUpdated
    };
}

vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(() => [
            mkPosition('BTCUSDT', 'long', 0),
            mkPosition('ETHUSDT', 'short', 0),
            mkPosition('XRPUSDT', 'long', 0),
            mkPosition('SOLUSDT', 'short', 0),
            mkPosition('DOGEUSDT', 'long', 0)
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

// Reaches into tradeService's private prefetch/request methods to stub them
// out for the benchmark. Named after fetchOpenPositionsFromApi, the real
// private method closeAllPositions() calls internally.
type TradeServiceInternals = {
    fetchOpenPositionsFromApi: () => Promise<void>;
    signedRequest: (method: string, endpoint: string, payload: Record<string, unknown>) => Promise<unknown>;
};
const internals = tradeService as unknown as TradeServiceInternals;

describe('tradeService benchmark (Optimized)', () => {
    bench('closeAllPositions with pre-fetch', async () => {
        const origFetch = internals.fetchOpenPositionsFromApi;
        const origSignedReq = internals.signedRequest;
        try {
            internals.fetchOpenPositionsFromApi = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                // Simulate that fetchOpenPositionsFromApi updates the cache correctly!
                vi.mocked(omsService.getPositions).mockReturnValue([
                    mkPosition('BTCUSDT', 'long', Date.now()),
                    mkPosition('ETHUSDT', 'short', Date.now()),
                    mkPosition('XRPUSDT', 'long', Date.now()),
                    mkPosition('SOLUSDT', 'short', Date.now()),
                    mkPosition('DOGEUSDT', 'long', Date.now())
                ]);
            });

            internals.signedRequest = vi.fn().mockResolvedValue({ code: 0 });

            // Force a stale environment for the original code path:
            vi.mocked(omsService.getPositions).mockReturnValue([
                mkPosition('BTCUSDT', 'long', 0),
                mkPosition('ETHUSDT', 'short', 0),
                mkPosition('XRPUSDT', 'long', 0),
                mkPosition('SOLUSDT', 'short', 0),
                mkPosition('DOGEUSDT', 'long', 0)
            ]);

            await tradeService.closeAllPositions();
        } finally {
            internals.fetchOpenPositionsFromApi = origFetch;
            internals.signedRequest = origSignedReq;
        }
    });
});
