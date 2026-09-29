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
import { clearKlineCache } from '../../../lib/server/klineCache';
// Mock fetch
global.fetch = vi.fn();
describe('GET /api/klines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route caches per candle, so state survives between tests unless it
    // is dropped here — without this, the second test asking for BTCUSDT/1d
    // is served the first test's response and asserts against stale data.
    clearKlineCache();
  });
  it('should return klines with string properties from Bitunix', async () => {
    const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: "100.5",
          high: "101.0",
          low: "99.0",
          close: "100.0",
          vol: "1000",
        },
        {
          id: 1600000060,
          open: "100.0",
          high: "100.5",
          low: "99.5",
          close: "99.8",
          vol: "500",
        }
      ]
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    } as unknown as Response);
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].open).toBe("100.5");
    expect(json[0].high).toBe("101.0");
    expect(json[0].low).toBe("99.0");
    expect(json[0].close).toBe("100.0");
    expect(json[0].volume).toBe("1000");
    expect(json[0].timestamp).toBe(1600000000);
  });
  it('should handle numeric inputs from Bitunix correctly', async () => {
     const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: 100.5,
          high: 101.0,
          low: 99.0,
          close: 100.0,
          vol: 1000,
        }
      ]
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    } as unknown as Response);
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();
    expect(json[0].open).toBe("100.5");
    expect(json[0].high).toBe("101"); // Number(101.0).toString() is "101"
    expect(json[0].low).toBe("99");
    expect(json[0].close).toBe("100");
    expect(json[0].volume).toBe("1000");
  });
  it('should preserve small numbers without scientific notation if string provided', async () => {
    const mockKlines = {
      code: 0,
      msg: "success",
      data: [
        {
          id: 1600000000,
          open: "0.0000001",
          high: "0.0000002",
          low: "0.0000001",
          close: "0.0000001",
          vol: "1000",
        }
      ]
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    } as unknown as Response);
    const url = new URL('http://localhost/api/klines?symbol=PEPEUSDT&provider=bitunix');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();
    expect(json[0].open).toBe("0.0000001");
    // If it was Decimal(x).toString(), it would likely be "1e-7"
  });
  it('should return a 504 instead of hanging when the upstream never responds', async () => {
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

    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const responsePromise = GET({ url } as unknown as Parameters<typeof GET>[0]);

    // All three retry attempts must run their full 8s upstream timeout
    // (plus backoff waits) before the route gives up.
    await vi.advanceTimersByTimeAsync(30000);

    const response = await responsePromise;
    const json = await response.json();

    expect(response.status).toBe(504);
    expect(json.error).toMatch(/timed out/i);
    vi.useRealTimers();
  });

  it('should handle Bitget array format', async () => {
    // [[timestamp, open, high, low, close, volume, quoteVol], ...]
    const mockKlines = [
      ["1600000000000", "100.5", "101.0", "99.0", "100.0", "1000", "100000"],
      ["1600000060000", "100.0", "100.5", "99.5", "99.8", "500", "50000"]
    ];
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockKlines),
    } as unknown as Response);
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitget');
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);
    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].open).toBe("100.5");
    expect(json[0].timestamp).toBe(1600000000000);
  });

  it('retries a transient upstream 5xx and succeeds on the next attempt', async () => {
    vi.useFakeTimers();
    const mockKlines = {
      code: 0,
      msg: "success",
      data: [{ id: 1600000000, open: "100.5", high: "101.0", low: "99.0", close: "100.0", vol: "1000" }]
    };
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'bad gateway' } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(mockKlines) } as unknown as Response);

    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const responsePromise = GET({ url } as unknown as Parameters<typeof GET>[0]);
    // Backoff between attempts (250ms) runs under fake timers.
    await vi.advanceTimersByTimeAsync(1000);
    const response = await responsePromise;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('surfaces the upstream error after the final retry attempt', async () => {
    vi.useFakeTimers();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    } as unknown as Response);

    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    const responsePromise = GET({ url } as unknown as Parameters<typeof GET>[0]);
    // 3 attempts with 250ms + 500ms backoff in between.
    await vi.advanceTimersByTimeAsync(3000);
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  // ---- FEAT-0390: mark-price klines --------------------------------------

  const okKlines = () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          msg: 'success',
          data: [{ id: 1600000000, open: '1', high: '1', low: '1', close: '1', vol: '1' }],
        }),
    } as unknown as Response);
  };

  const requestedUrl = () => String(vi.mocked(global.fetch).mock.calls[0][0]);

  /**
   * The chart and every indicator go through this route. A `type` parameter
   * appearing on an ordinary request would change what the whole app charts,
   * so the default path must stay exactly as it was.
   */
  it('sends no kline type at all when no price source is asked for', async () => {
    okKlines();
    const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix');
    await GET({ url } as unknown as Parameters<typeof GET>[0]);
    expect(requestedUrl()).not.toContain('type=');
  });

  it('asks Bitunix for the mark series when the caller does', async () => {
    okKlines();
    const url = new URL(
      'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&priceSource=mark',
    );
    await GET({ url } as unknown as Parameters<typeof GET>[0]);
    expect(requestedUrl()).toContain('type=MARK_PRICE');
  });

  it('treats an explicit last price source as the default', async () => {
    okKlines();
    const url = new URL(
      'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&priceSource=last',
    );
    await GET({ url } as unknown as Parameters<typeof GET>[0]);
    expect(requestedUrl()).not.toContain('type=');
  });

  /**
   * Bitget's mix candles endpoint is last-price only. Answering a mark request
   * from it would hand back last-price candles under a mark label — a wrong
   * alarm that looks like a right one.
   */
  it('refuses a mark request on a venue that cannot serve one', async () => {
    okKlines();
    const url = new URL(
      'http://localhost/api/klines?symbol=BTCUSDT&provider=bitget&priceSource=mark',
    );
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(501);
    expect((await response.json()).error).toContain('mark-price');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an unknown price source rather than falling back to last', async () => {
    okKlines();
    const url = new URL(
      'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&priceSource=index',
    );
    const response = await GET({ url } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  /**
   * The client asks for the newest candles with endTime = Date.now(), so two
   * callers a second apart send two different URLs. These two tests are the
   * reason the key exists: without flooring the window to the candle it falls
   * in, the second call reaches the venue again.
   */
  describe('caching a rolling window', () => {
    /** A real 1d candle boundary. */
    const BAR_1D = 1_700_006_400_000;

    it('serves a second request in the same candle without a second upstream call', async () => {
      okKlines();
      vi.useFakeTimers();
      vi.setSystemTime(BAR_1D + 3_600_000);

      const first = await GET({
        url: new URL(
          'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&interval=1m&limit=200&endTime=' +
            (BAR_1D + 1_000),
        ),
      } as unknown as Parameters<typeof GET>[0]);
      const second = await GET({
        url: new URL(
          'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&interval=1m&limit=200&endTime=' +
            (BAR_1D + 59_000),
        ),
      } as unknown as Parameters<typeof GET>[0]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual(await first.json());
      expect(global.fetch).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('reaches the venue again once the candle has closed', async () => {
      okKlines();
      vi.useFakeTimers();

      vi.setSystemTime(BAR_1D + 1_000);
      await GET({
        url: new URL(
          'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&interval=1m&limit=200&endTime=' +
            (BAR_1D + 1_000),
        ),
      } as unknown as Parameters<typeof GET>[0]);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      vi.setSystemTime(BAR_1D + 60_000);
      await GET({
        url: new URL(
          'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&interval=1m&limit=200&endTime=' +
            (BAR_1D + 60_000),
        ),
      } as unknown as Parameters<typeof GET>[0]);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  it('clamps a limit larger than any caller can use', async () => {
    okKlines();
    const url = new URL(
      'http://localhost/api/klines?symbol=BTCUSDT&provider=bitunix&limit=1000000',
    );
    await GET({ url } as unknown as Parameters<typeof GET>[0]);

    const upstream = new URL(vi.mocked(global.fetch).mock.calls[0][0] as string);
    expect(upstream.searchParams.get("limit")).toBe("1000");
  });
});
