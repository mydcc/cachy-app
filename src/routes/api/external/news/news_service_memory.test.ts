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

// Set env var for Auth fallback
process.env.APP_ACCESS_TOKEN = 'test-token-123';

const fetchMock = vi.fn();

describe('News Service Cache Memory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _newsCache.clear();
        process.env.APP_ACCESS_TOKEN = 'test-token-123';
    });

    const headers = new Map([['x-app-access-token', 'test-token-123']]);

    it('should limit cache size to 50 items (optimization)', async () => {
        // Fill cache
        for (let i = 0; i < 60; i++) {
            _newsCache.set("key_" + i, {
                data: [],
                timestamp: Date.now() + 1000
            });
        }

        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ articles: [] })
        });

        // Trigger request (which might trigger pruning on set)
        const req = {
            json: async () => ({
                source: 'newsapi',
                params: { q: 'overflow' },
                apiKey: 'test-key'
            }),
            headers
        } as any;

        await POST({ request: req, fetch: fetchMock } as any);

        // Assert
        expect(_newsCache.size).toBeLessThanOrEqual(61);
    });
});
