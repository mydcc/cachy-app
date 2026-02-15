
import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';

// Mock dependencies
vi.mock('../../../lib/server/auth', () => ({
    checkAppAuth: vi.fn().mockReturnValue(null) // Success
}));

vi.mock('../../../utils/server/bitunix', () => ({
    generateBitunixSignature: vi.fn(),
    validateBitunixKeys: vi.fn()
}));

// Mock logger to avoid console spam
vi.stubGlobal('console', { error: vi.fn(), log: vi.fn() });

describe('TP/SL API Security', () => {
    it('should return 400 Bad Request for malformed JSON body', async () => {
        // Mock Request object
        const request = {
            json: async () => { throw new Error('Should not use json()'); },
            text: async () => "{ invalid_json: " // Malformed JSON
        };

        const response = await POST({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(400);
        // The error message might vary depending on exactly where it fails,
        // but our implementation should catch it.
        // If we use safeJsonParse, it throws on invalid JSON.
        expect(data.error).toBeDefined();
    });

    it('should return 400 Bad Request for valid JSON but invalid Zod schema', async () => {
        const request = {
            json: async () => { throw new Error('Should not use json()'); },
            text: async () => JSON.stringify({ exchange: "unknown" }) // Invalid schema
        };

        const response = await POST({ request } as any);
        const data = await response.json();

        expect(response.status).toBe(400);
        // Expect validation error
        expect(data.error).toContain('Validation Error');
    });
});
