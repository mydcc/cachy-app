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
import { GET } from './+server';
import { cache } from '$lib/server/cache';

describe('GET /api/funding-rate', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('proxies the Bitunix funding_rate/batch endpoint as-is', async () => {
    const mockResponse = {
      code: 0,
      data: [
        {
          symbol: 'BTCUSDT',
          markPrice: '60000',
          lastPrice: '60001',
          indexPrice: '60001',
          fundingRate: '0.0005',
          fundingInterval: 8,
          nextFundingTime: '1770710400000',
          maxFundingRate: '0.3',
          minFundingRate: '-0.3',
        },
      ],
      msg: 'Success',
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    } as unknown as Response);

    const url = new URL('http://localhost/api/funding-rate?provider=bitunix');
    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://fapi.bitunix.com/api/v1/futures/market/funding_rate/batch',
    );
    expect(json).toEqual(mockResponse);
  });

  it('rejects unsupported providers without calling upstream', async () => {
    const mockFetch = vi.fn();
    const url = new URL('http://localhost/api/funding-rate?provider=bitget');
    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns a 500 with the upstream error when the upstream request fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    } as unknown as Response);

    const url = new URL('http://localhost/api/funding-rate?provider=bitunix');
    const response = await GET({
      url,
      fetch: mockFetch,
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(502);
  });
});
