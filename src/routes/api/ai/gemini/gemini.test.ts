/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';
import { GET as GET_MODELS } from './models/+server';
import * as clientToken from '../../../../lib/server/clientToken';
import type { RequestEvent } from '@sveltejs/kit';

const getClientAddress = () => '127.0.0.1';

describe('POST /api/ai/gemini', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
    });

    it('should return 401 if x-api-key header is missing', async () => {
        const request = new Request('http://localhost/api/ai/gemini', {
            method: 'POST',
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Hello' }],
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Missing API Key');
    });

    it('should reject invalid model identifiers with path traversal or query injection with 400 (BUG-0238)', async () => {
        const invalidModels = [
            '../gemini-pro',
            'gemini-flash?key=injected',
            'gemini-flash#frag',
            'models/gemini',
            'gemini;rm -rf',
            'gemini flash',
            'gemini@version',
        ];

        for (const badModel of invalidModels) {
            const request = new Request('http://localhost/api/ai/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }],
                    model: badModel,
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'test-gemini-key',
                },
            });

            const response = await POST({
                request,
                getClientAddress,
            } as unknown as RequestEvent);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('Invalid model identifier');
        }
    });

    it('should accept valid model identifiers, pass key via x-goog-api-key header and omit key from URL (FEAT-0377)', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(
            new Response('data: {"candidates":[]}\n\n', {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            })
        );

        vi.stubGlobal('fetch', fetchSpy);

        const validModels = [
            'gemini-2.5-flash',
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp',
            'gemini-3.5-flash',
            'custom_model.v1',
        ];

        for (const validModel of validModels) {
            const request = new Request('http://localhost/api/ai/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }],
                    model: validModel,
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': 'test-key',
                },
            });

            const response = await POST({
                request,
                getClientAddress,
            } as unknown as RequestEvent);

            expect(response.status).toBe(200);
            expect(fetchSpy).toHaveBeenCalled();
            const [calledUrl, options] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
            expect(calledUrl).toContain(`models/${encodeURIComponent(validModel)}:streamGenerateContent`);
            expect(calledUrl).not.toContain('key=');
            expect(options.headers).toHaveProperty('x-goog-api-key', 'test-key');
        }

        vi.unstubAllGlobals();
    });

    it('should not attach x-goog-api-key when using baseUrl fallback without apiKey', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(
            new Response('data: {"candidates":[]}\n\n', {
                status: 200,
                headers: { 'Content-Type': 'text/event-stream' },
            })
        );

        vi.stubGlobal('fetch', fetchSpy);

        const request = new Request('http://localhost/api/ai/gemini', {
            method: 'POST',
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Hello' }],
                baseUrl: 'http://localhost:8080',
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(200);
        const [calledUrl, options] = fetchSpy.mock.calls[0];
        expect(calledUrl).not.toContain('key=');
        expect(options.headers['x-goog-api-key']).toBeUndefined();

        vi.unstubAllGlobals();
    });
});

describe('GET /api/ai/gemini/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
    });

    it('passes apiKey via x-goog-api-key header and omits key query parameter (FEAT-0377)', async () => {
        const fetchSpy = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ models: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        vi.stubGlobal('fetch', fetchSpy);

        const request = new Request('http://localhost/api/ai/gemini/models', {
            method: 'GET',
            headers: {
                'x-api-key': 'models-test-key',
            },
        });

        const response = await GET_MODELS({
            url: new URL('http://localhost/api/ai/gemini/models'),
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalled();
        const [calledUrl, options] = fetchSpy.mock.calls[0];
        expect(calledUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models');
        expect(calledUrl).not.toContain('key=');
        expect(options.headers).toHaveProperty('x-goog-api-key', 'models-test-key');

        vi.unstubAllGlobals();
    });
});
