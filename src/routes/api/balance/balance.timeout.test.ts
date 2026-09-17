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
import { signedEnvelopeRequest } from '../../../tests/helpers/signedEnvelopeRequest';
import { buildBalanceQueryParams } from '../../../utils/exchange/venueQueries';

global.fetch = vi.fn();

describe('POST /api/balance upstream timeout (BUG-0267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
  });

  it('answers with a typed 504 when the exchange never responds', async () => {
    // Signed before the fake clock starts: the envelope covers the parameters
    // this route rebuilds, and the signer is not what this test is about.
    const { request } = await signedEnvelopeRequest(
      '/api/balance',
      { exchange: 'bitunix' },
      buildBalanceQueryParams('bitunix'),
      'bitunix',
    );

    vi.useFakeTimers();
    // Never-resolving upstream that only reacts to abort.
    vi.mocked(global.fetch).mockImplementation((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const responsePromise = POST({
      request,
      getClientAddress: () => '127.0.0.1',
    } as unknown as Parameters<typeof POST>[0]);

    await vi.advanceTimersByTimeAsync(10000);
    const response = await responsePromise;
    const json = await response.json();

    expect(response.status).toBe(504);
    expect(json.error).toMatch(/timed out/i);
    vi.useRealTimers();
  });
});
