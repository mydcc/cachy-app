/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('./omsService', () => ({
  omsService: {
    getPositions: vi.fn(),
    updatePosition: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
    updateOrder: vi.fn(),
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

vi.mock('../stores/market.svelte', async () => {
    const { Decimal } = await import('decimal.js');
    return {
        marketState: {
            data: {
                'BTCUSDT': { lastPrice: new Decimal(50000) }
            }
        }
    };
});

vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  }
}));

describe('TradeService Flash Close Reproduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('flashClosePosition crashes if cancelAllOrders fails', async () => {
    const symbol = 'BTCUSDT';
    const side = 'long';

    // Fresh position
    const freshPos = {
      symbol,
      side,
      amount: new Decimal(1),
      lastUpdated: Date.now(),
    };

    vi.mocked(omsService.getPositions).mockReturnValue([freshPos]);

    // Mock fetch to simulate cancelAllOrders failure
    // The first call will be "cancel-all"
    vi.mocked(global.fetch).mockImplementation(async (url: string, options: { body: string }) => {
        const body = JSON.parse(options.body);

        if (body.type === 'cancel-all') {
            return {
                ok: false,
                status: 504,
                text: () => Promise.resolve('Gateway Timeout')
            };
        }

        if (body.type === 'place-order' || body.side === 'SELL' || body.side === 'BUY') {
             return {
                ok: true,
                text: () => Promise.resolve(JSON.stringify({ code: 0, msg: 'success' }))
             };
        }

        return {
            ok: false,
            text: () => Promise.resolve('Unknown')
        };
    });

    // Expect flashClosePosition to resolve (Best Effort)
    await expect(tradeService.flashClosePosition(symbol, side)).resolves.toEqual({ success: true, data: { code: 0, msg: 'success' } });

    // Verify that the CLOSE order WAS sent despite cancel failure
    // We expect 2 calls (cancel-all, then place-order)
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstCallArgs = vi.mocked(global.fetch).mock.calls[0];
    expect(JSON.parse(firstCallArgs[1].body).type).toBe('cancel-all');

    const secondCallArgs = vi.mocked(global.fetch).mock.calls[1];
    const secondBody = JSON.parse(secondCallArgs[1].body);
    // It is a POST /api/orders
    expect(secondCallArgs[0]).toBe('/api/orders');
    // For closePosition, we check side or other params
    expect(secondBody.reduceOnly).toBe(true);
  });
});
