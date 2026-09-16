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
import { POST } from './+server';
import * as clientToken from '../../../lib/server/clientToken';
import {
  signedEnvelopeRequest,
  TEST_SIGNING_KEYS,
} from '../../../tests/helpers/signedEnvelopeRequest';
import { buildSyncQueryParams } from '../../../utils/exchange/venueQueries';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const getClientAddress = () => '127.0.0.1';

const handler = (request: Request) =>
  POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      // The route reads the exchange body via readExchangeJson (text() +
      // safeJsonParse) so long numeric IDs keep their precision. A real
      // Response offers both, so the mock must too.
      text: async () => JSON.stringify({ code: 0, data: { tradeList: [] } }),
    });
  });

  it('forwards the client envelope upstream and never the secret', async () => {
    const payload = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync',
      payload,
      buildSyncQueryParams(payload),
    );

    const response = await handler(request);
    expect(response.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toContain('https://fapi.bitunix.com/api/v1/futures/trade/get_history_trades');
    // The venue sees the client's credential material, not one this server
    // minted — there is nothing here for the server to have signed with.
    expect(options.headers['api-key']).toBe(TEST_SIGNING_KEYS.apiKey);
    expect(options.headers['sign']).toBeTruthy();
    expect(options.headers['nonce']).toBeTruthy();
    expect(options.headers['timestamp']).toBeTruthy();
    expect(JSON.stringify(options.headers)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
    expect(String(url)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
  });

  it('rejects a request that carries no envelope', async () => {
    const request = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('PRESIGNED_ENVELOPE_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body whose parameters diverge from the signed query', async () => {
    // Signed for `limit=10`, delivered asking for `limit=90`: forwarding this
    // would send the venue a query the client never signed.
    const { request } = await signedEnvelopeRequest(
      '/api/sync',
      { limit: 90 },
      buildSyncQueryParams({ limit: 10 }),
    );

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('PRESIGNED_DIVERGENCE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const { request } = await signedEnvelopeRequest('/api/sync', { limit: 10 });
    const broken = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: '{"limit":',
    });

    const response = await handler(broken);
    expect(response.status).toBe(400);
  });
});
