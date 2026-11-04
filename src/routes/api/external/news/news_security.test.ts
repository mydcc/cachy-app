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

    it('should not serve cached data to a different client (BUG-0776)', async () => {
        const apiKey = 'shared-key';
        const params = { q: 'bitcoin' };
        const responseData = { status: "ok", articles: [{ title: 'secure-data' }] };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => responseData,
            text: async () => "",
        });
        const makeRequest = () => ({
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({
                source: 'newsapi',
                params: params
            }),
            url: 'http://localhost/api/news'
        } as unknown as Request);

        // First client fills the cache.
        const first = await POST({
            request: makeRequest(),
            fetch: fetchMock,
            getClientAddress: () => '127.0.0.1',
        } as unknown as Parameters<typeof POST>[0]);
        expect(first.status).toBe(200);
        expect(_newsCache.size).toBe(1);

        // A second client with the same API key must not share that entry:
        // the namespace is the client token/address, not the credential.
        const second = await POST({
            request: makeRequest(),
            fetch: fetchMock,
            getClientAddress: () => '127.0.0.2',
        } as unknown as Parameters<typeof POST>[0]);
        expect(second.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sends an abort signal with the upstream request (BUG-0789)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });
        const apiKey = 'signal-key';

        const response = await POST({
            request: {
                headers: new Headers({ 'x-api-key': apiKey }),
                json: async () => ({ source: 'newsapi', params: { q: 'signal' } }),
                url: 'http://localhost/api/news',
            } as unknown as Request,
            fetch: fetchMock,
            getClientAddress: () => '127.0.0.1',
        } as unknown as Parameters<typeof POST>[0]);

        expect(response.status).toBe(200);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('answers 504 and does not retry another plan when an upstream times out (BUG-0789)', async () => {
        // Every CryptoPanic plan would otherwise be tried, tripling the
        // deadline past the client's own abort.
        const fetchMock = vi.fn().mockRejectedValue(
            Object.assign(new Error("Upstream exchange API timed out"), { status: 504 }),
        );
        const apiKey = 'timeout-key';

        const response = await POST({
            request: {
                headers: new Headers({ 'x-api-key': apiKey }),
                json: async () => ({ source: 'cryptopanic', params: { q: 'timeout' } }),
                url: 'http://localhost/api/news',
            } as unknown as Request,
            fetch: fetchMock,
            getClientAddress: () => '127.0.0.1',
        } as unknown as Parameters<typeof POST>[0]);

        expect(response.status).toBe(504);
        expect(fetchMock).toHaveBeenCalledTimes(1);
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
                json: async () => ({ source: 'newsapi', params: { q: `query-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).not.toBe(429);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'newsapi', params: { q: 'query-final' } }),
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
                json: async () => ({ source: 'newsapi', params: { q: `rotated-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).not.toBe(429);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': 'rotated-final' }),
            json: async () => ({ source: 'newsapi', params: { q: 'rotated-final' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        expect(res.status).toBe(429);
    });

    it('does not forward upstream error text (BUG-0727)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'upstream secret detail',
            json: async () => ({}),
        });

        const apiKey = 'news-error-key';
        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'cryptopanic', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        const body = await res.json();

        expect(body.error).toBe('News provider request failed');
        expect(JSON.stringify(body)).not.toContain('upstream secret detail');
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
            json: async () => ({ source: 'cryptopanic', params: { q: 'bitcoin' } }),
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
                json: async () => ({ source: 'newsapi', params: { q: `token-${i}` } }),
                url: 'http://localhost/api/news'
            } as unknown as Request;
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress: () => `10.2.0.${i}` } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).toBe(200);
        }

        const requestMock = {
            headers: new Headers({ 'x-api-key': 'token-final', 'x-app-access-token': token }),
            json: async () => ({ source: 'newsapi', params: { q: 'token-final' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;
        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress: () => '10.2.0.99' } as unknown as Parameters<typeof POST>[0]);
        expect(res.status).toBe(429);
    });

    it('rejects a raw secret header instead of using it as the API key (BUG-0776)', async () => {
        const fetchMock = vi.fn();
        const requestMock = {
            headers: new Headers({ 'x-api-secret': 'raw-secret-only' }),
            json: async () => ({ source: 'newsapi', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('Unsupported credential header');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a passphrase header (BUG-0776)', async () => {
        const fetchMock = vi.fn();
        const requestMock = {
            headers: new Headers({ 'x-api-passphrase': 'secret' }),
            json: async () => ({ source: 'newsapi', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('Unsupported credential header');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a secret header even when a valid key is present (BUG-0776)', async () => {
        const fetchMock = vi.fn();
        const requestMock = {
            headers: new Headers({ 'x-api-key': 'valid-key', 'x-api-secret': 'secret' }),
            json: async () => ({ source: 'newsapi', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('Unsupported credential header');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an apiKey supplied only in the body (BUG-0776)', async () => {
        const fetchMock = vi.fn();
        const requestMock = {
            headers: new Headers(),
            json: async () => ({ source: 'newsapi', apiKey: 'body-only-key', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('Unsupported credential field');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a body secret even with a valid header (BUG-0776)', async () => {
        const fetchMock = vi.fn();
        const requestMock = {
            headers: new Headers({ 'x-api-key': 'valid-key' }),
            json: async () => ({ source: 'newsapi', apiSecret: 'body-secret', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('Unsupported credential field');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serves a repeated request from the cache (BUG-0776)', async () => {
        const apiKey = 'cache-hit-key';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });
        const makeRequest = () => ({
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'newsapi', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request);

        const first = await POST({ request: makeRequest(), fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
        const second = await POST({ request: makeRequest(), fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the raw API key out of the cache map key (BUG-0776)', async () => {
        const apiKey = 'cache-map-secret';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", articles: [] }),
            text: async () => "",
        });
        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'newsapi', params: { q: 'cache-key' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);

        expect(res.status).toBe(200);
        expect(_newsCache.size).toBe(1);
        expect([..._newsCache.keys()].some((key) => key.includes(apiKey))).toBe(false);
    });

    it('redacts the raw and encoded key from upstream error logs (BUG-0776)', async () => {
        const apiKey = 'secret-key&value';
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cause = new Error(`request failed for auth_token=${encodeURIComponent(apiKey)}`);
        const fetchMock = vi.fn().mockRejectedValue(
            new Error(`upstream echo ${apiKey} ${encodeURIComponent(apiKey)}`, { cause }),
        );
        const requestMock = {
            headers: new Headers({ 'x-api-key': apiKey }),
            json: async () => ({ source: 'newsapi', params: { q: 'bitcoin' } }),
            url: 'http://localhost/api/news'
        } as unknown as Request;

        try {
            const res = await POST({ request: requestMock, fetch: fetchMock, getClientAddress } as unknown as Parameters<typeof POST>[0]);
            expect(res.status).toBe(500);

            const logged = [...errorLog.mock.calls, ...warnLog.mock.calls]
                .flat()
                .map((value) => String(value))
                .join(" ");
            expect(logged).not.toContain(apiKey);
            expect(logged).not.toContain(encodeURIComponent(apiKey));
        } finally {
            errorLog.mockRestore();
            warnLog.mockRestore();
        }
    });
});
