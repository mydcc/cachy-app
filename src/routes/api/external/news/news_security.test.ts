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
import { POST, _newsCache, _rateLimits } from './+server';
import * as clientToken from '../../../../lib/server/clientToken';

const getClientAddress = () => '127.0.0.1';

describe('News Service Security', () => {
    beforeEach(() => {
        _newsCache.clear();
        _rateLimits.clear();
        vi.clearAllMocks();
        vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
    });

    it('should not serve cached data to a different API key', async () => {
        const validKey = 'key-A';
        const invalidKey = 'key-B';
        const params = { q: 'bitcoin' };
        const responseData = { status: "ok", articles: [{ title: 'secure-data' }] };

        // Mock fetch
        const fetchMock = vi.fn().mockImplementation(async (url, options) => {
            if (url.includes(validKey) || options?.headers?.["X-Api-Key"] === validKey || options?.headers?.["x-api-key"] === validKey) {
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
            headers: new Headers({ 'x-api-key': validKey }),
            json: async () => ({
                source: 'newsapi',
                apiKey: validKey,
                params: params
            }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        await POST({ request: req1, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        // Verify it was cached
        expect(_newsCache.size).toBeGreaterThan(0);

        // 2. Request with Invalid Key
        const req2 = {
            headers: new Headers({ 'x-api-key': invalidKey }),
            json: async () => ({
                source: 'newsapi',
                apiKey: invalidKey, // Different key
                params: params
            }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res2 = await POST({ request: req2, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        const json2 = await res2.json();

        // If vulnerable, json2 will be responseData (from cache)
        // If fixed, json2 should be an error because the fetch failed

        expect(json2).not.toEqual(responseData);
        expect(json2).toHaveProperty('error');
    });

    it('should rate limit upstream-bound requests from one client address', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });
        const apiKey = 'rate-limit-key';

        // Each request uses a unique query to avoid cache hits, ensuring every
        // request reaches the rate limiter.
        for (let i = 0; i < 10; i++) {
            const requestMock = {
                headers: new Headers({ 'x-api-key': apiKey }),
                json: async () => ({ source: 'newsapi', apiKey, params: { q: `query-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).not.toBe(429);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'newsapi', apiKey, params: { q: 'query-final' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toContain('Rate limit exceeded');
    });

    it('should key the rate limit on the client address, not the caller-supplied API key', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });

        // A caller rotating API keys must not get a fresh budget per key: the
        // limiter is keyed on the client address, so the 11th upstream-bound
        // request from one address is refused even when every apiKey differs.
        for (let i = 0; i < 10; i++) {
            const apiKey = `rotated-key-${i}`;
            const requestMock = {
                headers: new Headers({ 'x-api-key': apiKey }),
                json: async () => ({ source: 'newsapi', apiKey, params: { q: `rotated-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).not.toBe(429);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': 'rotated-final' }),
            json: async () => ({ source: 'newsapi', apiKey: 'rotated-final', params: { q: 'rotated-final' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        expect(res.status).toBe(429);
    });

    it('URL-encodes the CryptoPanic auth token so it cannot inject a parameter', async () => {
        const apiKey = 'key&injected=1';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: [] }),
            text: async () => "",
        });

        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'cryptopanic', apiKey, params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(200);
        const [calledUrl] = fetchMock.mock.calls[0];
        expect(calledUrl).toContain('auth_token=key%26injected%3D1');
        expect(calledUrl).not.toContain('&injected=1');
    });

    it('should key the rate limit on the client token, not the client address', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });
        const token = 'shared-client-token';

        // One token, ten different addresses: the budget is per client token,
        // so the 11th upstream-bound request is refused even though every
        // request comes from a different address.
        for (let i = 0; i < 10; i++) {
            const apiKey = `token-key-${i}`;
            const requestMock = {
                headers: new Headers({ 'x-api-key': apiKey, 'x-app-access-token': token }),
                json: async () => ({ source: 'newsapi', apiKey, params: { q: `token-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress: () => `10.2.0.${i}` } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).toBe(200);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': 'token-final', 'x-app-access-token': token }),
            json: async () => ({ source: 'newsapi', apiKey: 'token-final', params: { q: 'token-final' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress: () => '10.2.0.99' } as unknown as Parameters<typeof POST>[0]);
        expect(res.status).toBe(429);
    });
});
