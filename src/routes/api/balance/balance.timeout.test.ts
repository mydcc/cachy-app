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
import { issueToken, _resetForTests } from '../../../lib/server/clientToken';

global.fetch = vi.fn();

describe('POST /api/balance upstream timeout (BUG-0267)', () => {
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTests();
    token = issueToken();
  });

  it('answers with a typed 504 when the exchange never responds', async () => {
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

    const request = new Request('http://localhost/api/balance', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-access-token': token,
      },
      body: JSON.stringify({ exchange: 'bitunix', apiKey: 'test-api-key', apiSecret: 'test-api-secret' }),
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
