import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './+server';

describe('POST /api/sentiment error handling', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return 500 and error message when a standard Error is thrown', async () => {
        const error = new Error('Test Error');
        const request = {
            json: vi.fn().mockRejectedValue(error),
        } as unknown as Request;

        const response = await POST({ request } as any);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual({ error: 'Test Error' });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Sentiment API Error:', error);
    });

    it('should return 500 and message when a string error is thrown', async () => {
        const errorString = 'Just a string error';
        const request = {
            json: vi.fn().mockRejectedValue(errorString),
        } as unknown as Request;

        const response = await POST({ request } as any);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual({ error: 'Just a string error' });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Sentiment API Error:', errorString);
    });

    it('should return 500 and fallback message for unknown object without message', async () => {
        const weirdObj = { foo: 'bar' };
        const request = {
            json: vi.fn().mockRejectedValue(weirdObj),
        } as unknown as Request;

        const response = await POST({ request } as any);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual({ error: 'INTERNAL_ERROR' });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Sentiment API Error:', weirdObj);
    });

    it('should return 500 and message from object with message property', async () => {
        const objError = { message: 'Custom Object Error' };
        const request = {
            json: vi.fn().mockRejectedValue(objError),
        } as unknown as Request;

        const response = await POST({ request } as any);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body).toEqual({ error: 'Custom Object Error' });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Sentiment API Error:', objError);
    });
});
