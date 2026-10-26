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
import { GET } from './+server';
import { checkClientToken } from '../../../../lib/server/clientToken';
import { safeFetch } from '../../../../lib/server/urlValidator';
import { json } from '@sveltejs/kit';

vi.mock('../../../../lib/server/clientToken', () => ({
  checkClientToken: vi.fn(),
}));
vi.mock('../../../../lib/server/urlValidator', () => ({
  safeFetch: vi.fn(),
}));

const getClientAddress = () => '127.0.0.1';

describe('CMC Proxy Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when checkClientToken fails', async () => {
    const authError = json({ error: 'Unauthorized' }, { status: 401 });
    vi.mocked(checkClientToken).mockReturnValue(authError);

    const request = {
      headers: new Headers(),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request, getClientAddress } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(checkClientToken).toHaveBeenCalledWith(request, '127.0.0.1');
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('does not forward the upstream error body (BUG-0727)', async () => {
    vi.mocked(checkClientToken).mockReturnValue(null);
    vi.mocked(safeFetch).mockResolvedValue(
      new Response('upstream secret detail', { status: 502 }),
    );

    const request = {
      headers: new Headers({ 'x-cmc-api-key': 'test-key' }),
    } as unknown as Request;
    const url = new URL(
      'http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest',
    );

    const response = await GET({
      url,
      request,
      getClientAddress,
    } as unknown as Parameters<typeof GET>[0]);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).not.toHaveProperty('details');
    expect(JSON.stringify(body)).not.toContain('upstream secret detail');
  });

  it('proxies through safeFetch, not the unguarded native fetch', async () => {
    vi.mocked(checkClientToken).mockReturnValue(null);
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(JSON.stringify({ data: 'test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const nativeFetch = vi.spyOn(globalThis, 'fetch');
    const request = {
      headers: new Headers({ 'x-cmc-api-key': 'test-key' }),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request, getClientAddress } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(checkClientToken).toHaveBeenCalledWith(request, '127.0.0.1');
    expect(safeFetch).toHaveBeenCalledTimes(1);
    expect(nativeFetch).not.toHaveBeenCalled();

    const [target, init] = vi.mocked(safeFetch).mock.calls[0];
    expect(target).toContain(
      'https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest',
    );
    expect((init?.headers as Record<string, string>)['X-CMC_PRO_API_KEY']).toBe(
      'test-key',
    );
  });
});
