import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jsonSuccess, jsonError, handleApiError } from './apiResponse';

describe('apiResponse', () => {
  describe('jsonSuccess', () => {
    it('returns a successful JSON response with data', async () => {
      const data = { id: 1, name: 'Test' };
      const response = jsonSuccess(data);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        success: true,
        data
      });
    });

    it('passes init options to the response', () => {
      const data = { ok: true };
      const init: ResponseInit = { status: 201, headers: { 'X-Custom': '1' } };
      const response = jsonSuccess(data, init);

      expect(response.status).toBe(201);
      expect(response.headers.get('X-Custom')).toBe('1');
    });
  });

  describe('jsonError', () => {
    it('returns an error JSON response with default values', async () => {
      const response = jsonError('Something went wrong');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong'
        }
      });
    });

    it('returns an error JSON response with custom values', async () => {
      const response = jsonError('Not Found', 'NOT_FOUND', 404, { path: '/foo' });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Not Found',
          details: { path: '/foo' }
        }
      });
    });
  });

  describe('handleApiError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('maps Validation Error to 400', async () => {
      const error = new Error('Validation Error: missing field');
      const response = handleApiError(error);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation Error: missing field'
        }
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('maps Zod error to 400', async () => {
      const error = new Error('Zod parsing failed');
      const response = handleApiError(error);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Zod parsing failed'
        }
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('maps Unauthorized error to 401', async () => {
      const error = new Error('User is Unauthorized');
      const response = handleApiError(error);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Unauthorized'
        }
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('maps 401 error to 401', async () => {
      const error = new Error('Request failed with status 401');
      const response = handleApiError(error);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Unauthorized'
        }
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('maps unknown error to 500 INTERNAL_ERROR', async () => {
      const error = new Error('Database connection failed');
      const response = handleApiError(error);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Database connection failed'
        }
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('API Error:', error);
    });

    it('handles non-Error objects (e.g. string throw)', async () => {
      const response = handleApiError('Just a string error');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Just a string error'
        }
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('API Error:', 'Just a string error');
    });

    it('handles null objects', async () => {
      const response = handleApiError(null);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'null'
        }
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('API Error:', null);
    });
  });
});
