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
import { logger } from '$lib/server/logger';
import {
  signedEnvelopeRequest,
  TEST_SIGNING_KEYS,
} from '../../../../tests/helpers/signedEnvelopeRequest';
import { buildPositionsHistoryQueryParams } from '../../../../utils/exchange/venueQueries';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const getClientAddress = () => '127.0.0.1';

const handler = (request: Request) =>
  POST({ request, getClientAddress } as unknown as Parameters<typeof POST>[0]);

describe('POST /api/sync/positions-history - Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
  });

  it('should sanitize API key in logs and response on error', async () => {
    // Simulate an upstream error that quotes the credential back at us.
    const errorMsg = `Invalid API Key: ${TEST_SIGNING_KEYS.apiKey}`;

    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => errorMsg,
      status: 400,
    });

    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const body = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/positions-history',
      body,
      buildPositionsHistoryQueryParams(body),
    );

    const response = await handler(request);
    const payload = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalled();

    const loggedArgs = loggerSpy.mock.calls[0];
    const loggedMessage =
      typeof loggedArgs[0] === 'string' ? loggedArgs[0] : loggedArgs.join(' ');

    expect(loggedMessage).not.toContain(TEST_SIGNING_KEYS.apiKey);
    expect(payload.error).not.toContain(TEST_SIGNING_KEYS.apiKey);
  });

  it('should work correctly with a valid envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      // See readExchangeJson: the route uses text() + safeJsonParse to preserve
      // numeric precision on exchange data.
      text: async () => JSON.stringify({ code: 0, data: { positionList: [] } }),
    });

    const body = { limit: 10 };
    const { request } = await signedEnvelopeRequest(
      '/api/sync/positions-history',
      body,
      buildPositionsHistoryQueryParams(body),
    );

    const response = await handler(request);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it('should reject a request that carries no envelope', async () => {
    const request = new Request('http://localhost/api/sync/positions-history', {
      method: 'POST',
      body: JSON.stringify({ limit: 10 }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('PRESIGNED_ENVELOPE_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
