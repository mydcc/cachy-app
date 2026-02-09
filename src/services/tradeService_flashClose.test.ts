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
import { marketState } from '../stores/market.svelte';

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

vi.mock('../stores/market.svelte', async (importOriginal) => {
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

describe('TradeService Flash Close Safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const setupMockFetch = (cancelFails: boolean) => {
    (global.fetch as any).mockImplementation(async (url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.type === 'cancel-all') {
            if (cancelFails) {
                return {
                    ok: false,
                    status: 504,
                    text: () => Promise.resolve('Gateway Timeout')
                };
            } else {
                return {
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify({ code: 0, msg: 'success' }))
                };
            }
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
  };

  it('flashClosePosition ABORTS if cancelAllOrders fails (Safe Mode)', async () => {
    const symbol = 'BTCUSDT';
    const side = 'long';

    // Fresh position
    const freshPos = {
      symbol,
      side,
      amount: new Decimal(1),
      lastUpdated: Date.now(),
    };

    (omsService.getPositions as any).mockReturnValue([freshPos]);

    // Simulate cancel failure
    setupMockFetch(true);

    // Expect flashClosePosition to REJECT
    await expect(tradeService.flashClosePosition(symbol, side)).rejects.toThrow("tradeErrors.closeAbortedDueToCancelFailure");

    // Verify only cancel was called
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const firstCallArgs = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(firstCallArgs[1].body).type).toBe('cancel-all');

    // Verify optimistic order removal
    expect(omsService.removeOrder).toHaveBeenCalled();
  });

  it('flashClosePosition PROCEEDS if cancelAllOrders fails but FORCE is true', async () => {
    const symbol = 'BTCUSDT';
    const side = 'long';

    const freshPos = {
      symbol,
      side,
      amount: new Decimal(1),
      lastUpdated: Date.now(),
    };

    (omsService.getPositions as any).mockReturnValue([freshPos]);

    setupMockFetch(true); // Cancel fails

    // Pass force=true
    await expect(tradeService.flashClosePosition(symbol, side, true)).resolves.toEqual({ code: 0, msg: 'success' });

    // Verify both called
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(omsService.removeOrder).not.toHaveBeenCalled(); // Should assume success or let regular flow handle it
  });
});
