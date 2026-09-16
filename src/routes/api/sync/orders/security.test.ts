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
import * as clientToken from '../../../../lib/server/clientToken';
import {
  signedEnvelopeRequest,
  TEST_SIGNING_KEYS,
} from '../../../../tests/helpers/signedEnvelopeRequest';
import { buildSyncOrdersQueryParams } from '../../../../utils/exchange/venueQueries';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const getClientAddress = () => '127.0.0.1';

const handler = (request: Request) =>
  POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);

describe('POST /api/sync/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
  });

  it('returns a 19-digit order ID unchanged (money path)', async () => {
    // The whole reason this route reads the exchange body via readExchangeJson
    // rather than response.json(): a 19-digit order ID exceeds
    // Number.MAX_SAFE_INTEGER, and JSON.parse would silently round it. A rounded
    // ID means a later cancel or modify targets the wrong order, or none.
    const ORDER_ID = '1234567890123456789';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        `{"code":0,"data":{"orderList":[{"orderId":${ORDER_ID},"symbol":"BTCUSDT","ctime":1700000000000}]}}`,
    });

    const body = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/orders',
      body,
      buildSyncOrdersQueryParams(body),
    );

    const response = await handler(request);
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain(ORDER_ID);
    // The rounded form must not appear anywhere in the payload.
    expect(text).not.toContain('1234567890123456800');
  });

  it('hands back the cursor the next page needs', async () => {
    // The route became stateless in FEAT-0405: the walk lives on the client,
    // and this is the only thing that lets it continue.
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        '{"code":0,"data":{"orderList":[{"orderId":"1","ctime":1700000000000}]}}',
    });

    const body = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/orders',
      body,
      buildSyncOrdersQueryParams(body),
    );

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect((await response.json()).nextEndTime).toBe(1699999999999);
  });

  it('forwards the client envelope upstream and never the secret', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '{"code":0,"data":{"orderList":[]}}',
    });

    const body = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/orders',
      body,
      buildSyncOrdersQueryParams(body),
    );

    expect((await handler(request)).status).toBe(200);

    // One envelope authorises all three order families: Bitunix's prehash does
    // not cover the path, so the same signed query reaches each of them.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(options.headers['api-key']).toBe(TEST_SIGNING_KEYS.apiKey);
      expect(options.headers['sign']).toBeTruthy();
      expect(String(url)).not.toContain(TEST_SIGNING_KEYS.apiSecret);
    }
  });

  it('should return 400 if JSON is malformed', async () => {
    const { request } = await signedEnvelopeRequest('/api/sync/orders', { limit: 10 });
    const broken = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: '{"limit":',
    });

    const response = await handler(broken);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid JSON');
  });

  it('should return 400 if the envelope is missing', async () => {
    const request = new Request('http://localhost/api/sync/orders', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('PRESIGNED_ENVELOPE_MISSING');
  });

  it('should return 400 if the body diverges from the signed query', async () => {
    const { request } = await signedEnvelopeRequest(
      '/api/sync/orders',
      { limit: 10, endTime: 123 },
      buildSyncOrdersQueryParams({ limit: 10 }),
    );

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('PRESIGNED_DIVERGENCE');
  });

  it('should return 400 if limit is not a number', async () => {
    const body = { limit: 'invalid' };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/orders',
      body,
      buildSyncOrdersQueryParams(body as { limit?: number }),
    );

    const response = await handler(request);
    expect(response.status).toBe(400);
  });
});
