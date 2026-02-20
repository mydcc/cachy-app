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
import { POST, _newsCache } from './+server';

// Mock fetch
const fetchMock = vi.fn();

describe('News Service Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _newsCache.clear();
        process.env.APP_ACCESS_TOKEN = 'test-token-123';
        vi.stubEnv('APP_ACCESS_TOKEN', 'test-token-123');
    });

    const headers = new Map([['x-app-access-token', 'test-token-123']]);

    it('should not serve cached data to a different API key', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'ok', totalResults: 1, articles: [{ title: 'News 1', url: 'http://news.com/1' }] }) // Full NewsAPI format
        });

        // 1. First Request (User A)
        const req1 = {
            json: async () => ({
                source: 'newsapi',
                params: { q: 'btc' },
                apiKey: 'user-key-A'
            }),
            headers
        } as any;

        const res1 = await POST({ request: req1, fetch: fetchMock } as any);
        const data1 = await res1.json();

        if (res1.status !== 200) {
             console.error("News Request 1 Failed:", data1);
        }

        expect(data1.articles).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Verify it was cached
        expect(_newsCache.size).toBeGreaterThan(0);

        // 2. Second Request (User B - Same query, different Key) -> Should MISS cache (security isolation)
        fetchMock.mockClear();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'ok', totalResults: 1, articles: [{ title: 'News 2', url: 'http://news.com/2' }] })
        });

        const req2 = {
            json: async () => ({
                source: 'newsapi',
                params: { q: 'btc' },
                apiKey: 'user-key-B'
            }),
            headers
        } as any;

        const res2 = await POST({ request: req2, fetch: fetchMock } as any);
        const data2 = await res2.json();

        // Should be treated as new request because cache key includes apiKey
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(data2.articles[0].title).toBe('News 2');
    });
});
