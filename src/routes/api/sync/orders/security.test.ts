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

vi.mock('../../../../lib/server/auth', () => ({
  checkAppAuth: vi.fn(() => null)
}));


describe('POST /api/sync/orders', () => {
  it('returns a 19-digit order ID unchanged (money path)', async () => {
    // The whole reason this route reads the exchange body via readExchangeJson
    // rather than response.json(): a 19-digit order ID exceeds
    // Number.MAX_SAFE_INTEGER, and JSON.parse would silently round it. A rounded
    // ID means a later cancel or modify targets the wrong order, or none.
    const ORDER_ID = '1234567890123456789';

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `{"code":0,"data":{"orderList":[{"orderId":${ORDER_ID},"symbol":"BTCUSDT"}]}}`,
      json: async () => ({ code: 0, data: { orderList: [{ orderId: Number(ORDER_ID), symbol: 'BTCUSDT' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = {
      json: async () => ({ apiKey: 'validApiKey123', apiSecret: 'validSecret123', limit: 10 }),
    } as Request;

    // `as unknown as` rather than `as any`: the surrounding tests predate the
    // lint ratchet, and new code should not add to the backlog.
    const response = await POST({
      request,
    } as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain(ORDER_ID);
    // The rounded form must not appear anywhere in the payload.
    expect(body).not.toContain('1234567890123456800');

    vi.unstubAllGlobals();
  });

  it('should return 400 if JSON is malformed', async () => {
    const request = {
      json: async () => {
        throw new Error('Unexpected end of JSON input');
      },
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('should return 400 if credentials are missing', async () => {
    const request = {
      json: async () => ({ limit: 10 }),
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request data');
  });

  it('should return 400 if limit is not a number', async () => {
    const request = {
      json: async () => ({ apiKey: 'key', apiSecret: 'secret', limit: 'invalid' }),
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
  });
});
