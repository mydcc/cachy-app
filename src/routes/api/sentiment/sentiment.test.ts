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
import * as clientToken from '../../../lib/server/clientToken';
import type { RequestEvent } from '@sveltejs/kit';

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: class {
            getGenerativeModel() {
                return {
                    generateContent: mockGenerateContent,
                };
            }
        },
    };
});

const getClientAddress = () => '127.0.0.1';

describe('Sentiment API Endpoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(clientToken, 'checkClientToken').mockReturnValue(null);
    });

    it('should return 400 when headlines are missing', async () => {
        const request = new Request('http://localhost/api/sentiment', {
            method: 'POST',
            body: JSON.stringify({ headlines: [], provider: 'gemini', apiKey: 'test-key' }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe('NO_HEADLINES');
    });

    it('should return heuristic fallback when Gemini service is unavailable (503)', async () => {
        mockGenerateContent.mockRejectedValue(
            new Error('[503 Service Unavailable] This model is currently experiencing high demand.')
        );

        const request = new Request('http://localhost/api/sentiment', {
            method: 'POST',
            body: JSON.stringify({
                headlines: [
                    'Bitcoin surges past 100k with massive ETF inflow and rally',
                    'Ethereum jumps 10% on institutional adoption',
                ],
                provider: 'gemini',
                model: 'gemini-3.7-flash',
                apiKey: 'test-api-key',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.analysis).toBeDefined();
        expect(data.analysis.regime).toBe('BULLISH');
        expect(data.analysis.score).toBeGreaterThan(0);
        expect(data.isFallback).toBe(true);
    });

    it('should correctly parse successful Gemini responses', async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => JSON.stringify({
                    score: 0.85,
                    regime: 'BULLISH',
                    summary: 'Strong bullish momentum across major assets.',
                    keyFactors: ['Spot ETF inflows', 'Breakout volume'],
                }),
            },
        });

        const request = new Request('http://localhost/api/sentiment', {
            method: 'POST',
            body: JSON.stringify({
                headlines: ['BTC sets new record high'],
                provider: 'gemini',
                model: 'gemini-1.5-flash',
                apiKey: 'test-api-key',
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.analysis.regime).toBe('BULLISH');
        expect(data.analysis.score).toBe(0.85);
        expect(data.isFallback).toBeUndefined();
    });

    it('should redact API key and sanitize error when upstream throws an error containing API key (BUG-0236)', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const secretKey = 'AIzaSySecretApiKey123456';

        mockGenerateContent.mockRejectedValue(
            new Error(`API_KEY_INVALID: Call failed with key=${secretKey}`)
        );

        const request = new Request('http://localhost/api/sentiment', {
            method: 'POST',
            body: JSON.stringify({
                headlines: ['BTC sets new record high'],
                provider: 'gemini',
                model: 'gemini-2.5-flash',
                apiKey: secretKey,
            }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST({
            request,
            getClientAddress,
        } as unknown as RequestEvent);

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.error).toBeDefined();
        expect(data.error).not.toContain(secretKey);
        expect(data.error).toContain('***');

        // Check console.error did not log the secret key
        expect(consoleErrorSpy).toHaveBeenCalled();
        const loggedArgs = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(loggedArgs).not.toContain(secretKey);
        consoleErrorSpy.mockRestore();
    });
});

