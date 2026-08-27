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

global.fetch = vi.fn();

describe('GET /api/tickers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a Bitunix non-2xx with code: 2 as 404 Symbol not found', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: 2, msg: 'symbol not exist' }),
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=NOPEUSDT1&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Symbol not found');
  });

  it('reports a Bitunix non-2xx with a "system error" message as 404 Symbol not found', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ code: 10007, msg: 'System error' }),
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=NOPEUSDT2&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Symbol not found');
  });

  it('passes through a Bitunix non-2xx unrelated to symbol lookup with its own status', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=NOPEUSDT3&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('bad gateway');
  });

  it('reports a Bitget non-2xx with its own upstream status, not 404', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ code: '40034', msg: 'symbol does not exist' }),
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=NOPEUSDT4&provider=bitget');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
  });

  it('reports a Bitget 5xx whose message contains "system error" with its own status, not 404', async () => {
    // A Bitget outage happening to phrase its message like Bitunix's
    // heuristic must not be misreported as "symbol not found" — that
    // heuristic is Bitunix's, not Bitget's.
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ code: '50000', msg: 'internal system error' }),
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=NOPEUSDT5&provider=bitget');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toBe('Symbol not found');
  });

  it('returns 200 ticker data on success', async () => {
    const mockTickers = [{ symbol: 'BTCUSDT', lastPrice: '65000' }];
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockTickers),
    } as unknown as Response);

    const url = new URL('http://localhost/api/tickers?symbols=BTCUSDT6&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(mockTickers);
  });
});
