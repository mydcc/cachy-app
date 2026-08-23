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
import {
  fetchWithTimeout,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  upstreamErrorStatus,
} from './fetchWithTimeout';

global.fetch = vi.fn();

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects with a typed 504 when the upstream never responds', async () => {
    vi.useFakeTimers();
    // Never-resolving upstream that only reacts to abort — models a hung
    // exchange connection.
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

    const pending = fetchWithTimeout('https://fapi.bitunix.com/api/v1/futures/market/kline', {});
    const assertion = expect(pending).rejects.toMatchObject({
      status: 504,
      message: /timed out/i,
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_UPSTREAM_TIMEOUT_MS);
    await assertion;
    vi.useRealTimers();
  });

  it('honours a custom timeout budget instead of the default', async () => {
    vi.useFakeTimers();
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

    const customBudget = 100;
    const pending = fetchWithTimeout('https://api.bitget.com/x', {}, customBudget);
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });

    // Just before the custom budget nothing may have happened yet.
    await vi.advanceTimersByTimeAsync(customBudget - 1);
    // (No rejection so far — the assertion below only settles at the budget.)
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    vi.useRealTimers();
  });

  it('resolves before the budget and passes init through with a signal attached', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    const mockResponse = { ok: true, status: 200 };
    vi.mocked(global.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const response = await fetchWithTimeout(
      'https://fapi.bitunix.com/api/v1/futures/trade/place_order',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );

    expect(response).toBe(mockResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, passedInit] = vi.mocked(global.fetch).mock.calls[0];
    expect(passedInit?.method).toBe('POST');
    expect((passedInit as RequestInit).headers).toEqual({ 'Content-Type': 'application/json' });
    expect((passedInit as RequestInit).signal).toBeInstanceOf(AbortSignal);

    // The abort timer is released on success — no dangling handle that
    // stacked retries could accumulate.
    expect(clearSpy).toHaveBeenCalled();
    // A late timer must not fire after success.
    await vi.advanceTimersByTimeAsync(DEFAULT_UPSTREAM_TIMEOUT_MS * 2);
    expect(response.status).toBe(200);
    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it('propagates non-abort network errors unchanged', async () => {
    vi.useFakeTimers();
    const boom = new Error('ECONNREFUSED');
    vi.mocked(global.fetch).mockRejectedValue(boom);

    const pending = fetchWithTimeout('https://api.bitget.com/x', {});
    await expect(pending).rejects.toBe(boom);
    vi.useRealTimers();
  });

  describe('upstreamErrorStatus', () => {
    it('reads a numeric status from an error object', () => {
      const err = new Error('Upstream exchange API timed out') as Error & { status?: number };
      err.status = 504;
      expect(upstreamErrorStatus(err)).toBe(504);
    });

    it('returns undefined for plain errors and non-errors', () => {
      expect(upstreamErrorStatus(new Error('boom'))).toBeUndefined();
      expect(upstreamErrorStatus('boom')).toBeUndefined();
      expect(upstreamErrorStatus(null)).toBeUndefined();
      const weird = { status: '504' };
      expect(upstreamErrorStatus(weird)).toBeUndefined();
    });
  });
});
