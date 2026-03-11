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
import { POST, _newsCache } from './+server';

describe('News Service Cache Memory', () => {
    beforeEach(() => {
        _newsCache.clear();
        vi.clearAllMocks();
    });

    it('should limit cache size to 50 items (optimization)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ articles: [] }),
            text: async () => "",
        });

        // Insert 100 items
        for (let i = 0; i < 100; i++) {
            const request = {
                json: async () => ({
                    source: 'newsapi',
                    apiKey: 'test-key',
                    params: { q: `test-${i}` }
                })
            } as any;

            await POST({ request, fetch: fetchMock } as any);
        }

        // Optimization: Cache size should be capped at 50
        expect(_newsCache.size).toBe(50);

        // Verify LRU: The last item (99) should exist, the first (0) should not
        const cacheKeyLast = `newsapi:{"q":"test-99"}:default:test-key`;
        expect(_newsCache.has(cacheKeyLast)).toBe(true);

        const cacheKeyFirst = `newsapi:{"q":"test-0"}:default:test-key`;
        expect(_newsCache.has(cacheKeyFirst)).toBe(false);
    });
});
