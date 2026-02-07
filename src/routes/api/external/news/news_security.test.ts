import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, _newsCache } from './+server';

describe('News Service Security', () => {
    beforeEach(() => {
        _newsCache.clear();
        vi.clearAllMocks();
    });

    it('should not serve cached data to a different API key', async () => {
        const validKey = 'key-A';
        const invalidKey = 'key-B';
        const params = { q: 'bitcoin' };
        const responseData = { articles: ['secure-data'] };

        // Mock fetch
        const fetchMock = vi.fn().mockImplementation(async (url) => {
            if (url.includes(validKey)) {
                return {
                    ok: true,
                    json: async () => responseData,
                    text: async () => "",
                };
            } else {
                 return {
                    ok: false,
                    status: 401,
                    text: async () => "Unauthorized",
                };
            }
        });

        // 1. Request with Valid Key
        const req1 = {
            json: async () => ({
                source: 'newsapi',
                apiKey: validKey,
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;
        await POST({ request: req1, fetch: fetchMock } as any);

        // Verify it was cached
        expect(_newsCache.size).toBeGreaterThan(0);

        // 2. Request with Invalid Key
        const req2 = {
            json: async () => ({
                source: 'newsapi',
                apiKey: invalidKey, // Different key
                params: params
            }),
            url: 'http://localhost/api/news'
        } as any;

        const res2 = await POST({ request: req2, fetch: fetchMock } as any);
        const json2 = await res2.json();

        // If vulnerable, json2 will be responseData (from cache)
        // If fixed, json2 should be an error because the fetch failed

        expect(json2).not.toEqual(responseData);
        expect(json2).toHaveProperty('error');
    });
});
