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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';

vi.mock('./apiService', () => ({
  apiService: {
    fetchBitunixFundingRates: vi.fn(),
  },
}));

vi.mock('../stores/market.svelte', () => ({
  marketState: {
    data: {} as Record<string, unknown>,
    updateSymbol: vi.fn(),
  },
}));

import { apiService } from './apiService';
import { marketState } from '../stores/market.svelte';
import { fundingRateService } from './fundingRateService';

describe('fundingRateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (marketState.data as Record<string, unknown>) = {};
    fundingRateService.stop();
  });

  afterEach(() => {
    fundingRateService.stop();
  });

  it('only updates symbols already tracked in marketState (avoids LRU eviction from untracked symbols)', async () => {
    (marketState.data as Record<string, unknown>) = { BTCUSDT: {} };
    const rates = new Map([
      ['BTCUSDT', { fundingRate: new Decimal('0.0005'), nextFundingTime: '1770710400000', fundingInterval: 8 }],
      ['ETHUSDT', { fundingRate: new Decimal('0.0003'), nextFundingTime: '1770710400000', fundingInterval: 8 }],
    ]);
    vi.mocked(apiService.fetchBitunixFundingRates).mockResolvedValue(rates);

    fundingRateService.start();
    await vi.waitFor(() => {
      expect(marketState.updateSymbol).toHaveBeenCalled();
    });

    expect(marketState.updateSymbol).toHaveBeenCalledTimes(1);
    expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', {
      fundingRate: new Decimal('0.0005'),
      nextFundingTime: '1770710400000',
      fundingInterval: 8,
    });
  });

  it('does not throw when the fetch fails', async () => {
    vi.mocked(apiService.fetchBitunixFundingRates).mockRejectedValue(new Error('network error'));

    expect(() => fundingRateService.start()).not.toThrow();
    await vi.waitFor(() => {
      expect(apiService.fetchBitunixFundingRates).toHaveBeenCalled();
    });
    expect(marketState.updateSymbol).not.toHaveBeenCalled();
  });

  it('start() is idempotent (does not schedule a second interval)', () => {
    vi.mocked(apiService.fetchBitunixFundingRates).mockResolvedValue(new Map());
    fundingRateService.start();
    const callsAfterFirstStart = vi.mocked(apiService.fetchBitunixFundingRates).mock.calls.length;
    fundingRateService.start();
    expect(vi.mocked(apiService.fetchBitunixFundingRates).mock.calls.length).toBe(callsAfterFirstStart);
  });

  describe('applyCachedRateFor', () => {
    it('backfills a symbol from the last poll immediately, without waiting for the next poll', async () => {
      // Symbol not tracked yet when the poll happens (e.g. page just loaded,
      // WS hasn't populated marketState for it yet) - reproduces the "row
      // missing for up to 60s" bug.
      const rates = new Map([
        ['BTCUSDT', { fundingRate: new Decimal('0.0005'), nextFundingTime: '1770710400000', fundingInterval: 8 }],
      ]);
      vi.mocked(apiService.fetchBitunixFundingRates).mockResolvedValue(rates);

      fundingRateService.start();
      await vi.waitFor(() => {
        expect(apiService.fetchBitunixFundingRates).toHaveBeenCalled();
      });
      expect(marketState.updateSymbol).not.toHaveBeenCalled(); // not tracked yet, poll skipped it

      // Symbol now starts being tracked (e.g. WS delivers a price tick).
      fundingRateService.applyCachedRateFor('BTCUSDT');

      expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', {
        fundingRate: new Decimal('0.0005'),
        nextFundingTime: '1770710400000',
        fundingInterval: 8,
      });
    });

    it('does nothing for a symbol with no cached rate', () => {
      fundingRateService.applyCachedRateFor('UNKNOWNUSDT');
      expect(marketState.updateSymbol).not.toHaveBeenCalled();
    });

    it('clears the cache on stop(), so a stale rate is not applied after restart', async () => {
      const rates = new Map([
        ['BTCUSDT', { fundingRate: new Decimal('0.0005'), nextFundingTime: '1770710400000', fundingInterval: 8 }],
      ]);
      vi.mocked(apiService.fetchBitunixFundingRates).mockResolvedValue(rates);

      fundingRateService.start();
      await vi.waitFor(() => {
        expect(apiService.fetchBitunixFundingRates).toHaveBeenCalled();
      });
      fundingRateService.stop();

      fundingRateService.applyCachedRateFor('BTCUSDT');
      expect(marketState.updateSymbol).not.toHaveBeenCalled();
    });
  });
});
