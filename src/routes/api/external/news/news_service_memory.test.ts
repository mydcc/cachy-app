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
        const cacheKeyLast = `newsapi:{"q":"test-99"}:default`;
        expect(_newsCache.has(cacheKeyLast)).toBe(true);

        const cacheKeyFirst = `newsapi:{"q":"test-0"}:default`;
        expect(_newsCache.has(cacheKeyFirst)).toBe(false);
    });
});
