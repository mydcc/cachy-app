import { GET } from './+server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally to prevent network calls
global.fetch = vi.fn();

describe('Klines API Validation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should return 400 if limit is not a number', async () => {
        const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&limit=abc');
        const event = { url } as any;

        const response = await GET(event);
        expect(response.status).toBe(400);
        const data = await response.json();
        // We expect "Validation Error" or similar from Zod
        expect(data.error).toMatch(/Validation|Invalid/i);
    });

    it('should return 400 if limit is negative', async () => {
        const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&limit=-10');
        const event = { url } as any;

        const response = await GET(event);
        expect(response.status).toBe(400);
    });

    it('should return 400 if start time is invalid string', async () => {
        const url = new URL('http://localhost/api/klines?symbol=BTCUSDT&start=invalid');
        const event = { url } as any;

        const response = await GET(event);
        expect(response.status).toBe(400);
    });
});
