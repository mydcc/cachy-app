
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError } from './apiClient';
import { logger } from './logger';
import Decimal from 'decimal.js';

// Mock dependencies
vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('ApiClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchMock.mockReset();
    });

    describe('serializePayload', () => {
        it('should serialize Decimal objects to strings', () => {
            const payload = {
                price: new Decimal('123.456'),
                amount: new Decimal('0.001'),
                nested: {
                    value: new Decimal('99.99')
                },
                array: [new Decimal('1'), new Decimal('2')]
            };

            const serialized = ApiClient.serializePayload(payload);

            expect(serialized.price).toBe('123.456');
            expect(serialized.amount).toBe('0.001');
            expect(serialized.nested.value).toBe('99.99');
            expect(serialized.array[0]).toBe('1');
            expect(serialized.array[1]).toBe('2');
        });

        it('should handle circular references gracefully', () => {
            const a: any = { val: 1 };
            const b: any = { val: 2, a };
            a.b = b;

            const serialized = ApiClient.serializePayload(a);
            expect(serialized.val).toBe(1);
            expect(serialized.b.val).toBe(2);
            expect(serialized.b.a).toBe('[Circular]');
        });
    });

    describe('request', () => {
        it('should perform a successful GET request', async () => {
            const mockResponse = { code: 0, data: { id: 1 } };
            fetchMock.mockResolvedValue({
                ok: true,
                text: async () => JSON.stringify(mockResponse),
                headers: new Headers(),
                status: 200
            });

            const result = await ApiClient.request('GET', '/api/test');
            expect(result).toEqual(mockResponse);
            expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({
                method: 'GET'
            }));
        });

        it('should handle HTTP error codes', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => JSON.stringify({ error: 'Auth failed' })
            });

            await expect(ApiClient.request('GET', '/api/test'))
                .rejects
                .toThrow('Auth failed');
        });

        it('should handle API level errors (code != 0)', async () => {
            const mockResponse = { code: 10002, msg: 'Invalid Parameter' };
            fetchMock.mockResolvedValue({
                ok: true, // HTTP 200
                status: 200,
                text: async () => JSON.stringify(mockResponse)
            });

            try {
                await ApiClient.request('POST', '/api/test', { foo: 'bar' });
            } catch (e: any) {
                expect(e).toBeInstanceOf(ApiError);
                expect(e.code).toBe(10002);
                expect(e.message).toBe('Invalid Parameter');
            }
        });

        it('should handle network errors', async () => {
            fetchMock.mockRejectedValue(new Error('Network Down'));

            await expect(ApiClient.request('GET', '/api/test'))
                .rejects
                .toThrow('Network Error');

            expect(logger.error).toHaveBeenCalledWith('network', expect.stringContaining('Network error'), expect.any(Error));
        });

        it('should handle invalid JSON responses', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => 'Internal Server Error (HTML)'
            });

            // ApiClient warns but might return empty object or throw if logic dictates
            // In current impl: if safeJsonParse fails, it logs warn and returns undefined/empty,
            // then checks response.ok (true) and code (undefined).
            // If code is undefined, it passes success check?
            // "if (data.code !== undefined && String(data.code) !== "0")" -> undefined != 0 is false.
            // So it returns empty object?
            // Actually safeJsonParse returns JSON.parse result. If invalid string, JSON.parse throws.
            // catch block: logs warn.
            // then returns `data = {}`.
            // returns {}.

            // Wait, if it returns {}, the caller might expect T.
            // This is "Robustness".

            const result = await ApiClient.request('GET', '/api/bad-json');
            expect(result).toEqual({});
            expect(logger.warn).toHaveBeenCalledWith('network', expect.stringContaining('Invalid JSON'), expect.any(String));
        });
    });
});
