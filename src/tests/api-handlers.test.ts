
import { describe, it, expect, vi } from 'vitest';
import { GET as getKlines } from '../routes/api/klines/+server';
import { POST as postAccount } from '../routes/api/account/+server';

// Mock checkAppAuth to bypass authentication
vi.mock('../lib/server/auth', () => ({
    checkAppAuth: () => null
}));

// Mock RequestEvent
function createMockEvent(urlParams: Record<string, string>, body: any = null, method = 'GET') {
    const url = new URL('http://localhost/api/test');
    Object.entries(urlParams).forEach(([k, v]) => url.searchParams.set(k, v));

    const request = {
        method,
        text: async () => JSON.stringify(body),
        json: async () => body,
        headers: new Headers(),
    };

    return {
        url,
        request,
        params: {},
        locals: { user: { id: 'mock' } } // Mock auth if needed
    } as any;
}

describe('API Handler Standardization', () => {
    describe('GET /api/klines', () => {
        it('returns standardized error when symbol is missing', async () => {
            const event = createMockEvent({});
            const response = await getKlines(event);
            const data = await response.json();

            // Expecting standard error format: { success: false, error: { code: '...', message: '...' } }
            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
            // We want to refactor to this structure:
            if (data.error && typeof data.error === 'object') {
                expect(data.error.code).toBe('MISSING_SYMBOL');
            } else {
                // Current behavior (string) -> fail if we expect object
                // But we assert what we WANT after refactor
                expect(data.error.code).toBe('MISSING_SYMBOL');
            }
        });
    });

    describe('POST /api/account', () => {
        it('returns standardized error when credentials missing', async () => {
            const event = createMockEvent({}, { exchange: 'bitunix' }, 'POST');
            const response = await postAccount(event);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
            // Current behavior uses jsonError but with hardcoded code "MISSING_CREDENTIALS" (I saw this in previous read)
            // But I want to verify structure.
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('MISSING_CREDENTIALS');
        });
    });
});
