/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

// Mock the dependencies

// Mock SvelteKit sequence hook directly to avoid 'get_request_store' internal errors
// when testing outside the actual SvelteKit application context.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence: (...handlers) => {
    return async ({ event, resolve }) => {
      let currentIndex = 0;

      const next = async (currentEvent, currentOptions) => {
        if (currentIndex >= handlers.length) {
          return resolve(currentEvent, currentOptions);
        }

        const handler = handlers[currentIndex++];
        return handler({
          event: currentEvent,
          resolve: async (e, opts) => next(e ?? currentEvent, opts)
        });
      };

      return next(event);
    };
  }
}));

vi.mock('$app/environment', () => ({
  building: false
}));

vi.mock('$lib/server/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Keep the settings-store graph out of SSR tests; the hook only awaits this promise.
vi.mock('./locales/i18n', () => ({
  i18nReady: Promise.resolve()
}));

// Save original console methods before the import patches them
const originalWarn = console.warn;
const originalError = console.error;

// Import after mocks are set up (vi.mock calls are hoisted automatically)
import { headersHandler, handle } from './hooks.server';
import { CONSTANTS } from '$lib/constants';

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  // Restore the original console methods to prevent cross-test contamination
  console.warn = originalWarn;
  console.error = originalError;
  delete (global as typeof global & { _isConsolePatched?: boolean })._isConsolePatched;
});

describe('headersHandler (Server Hook)', () => {
  it('should set the expected HTTP security headers on the response', async () => {
    // Arrange
    const mockEvent = {} as RequestEvent;

    // Create a standard Response to represent what resolve() would return
    const mockResponse = new Response('test body', { status: 200 });

    // Mock the resolve function to return the response
    const mockResolve = vi.fn().mockResolvedValue(mockResponse);

    // Act
    const result = await headersHandler({ event: mockEvent, resolve: mockResolve });

    // Assert
    expect(mockResolve).toHaveBeenCalledWith(mockEvent);
    expect(result).toBe(mockResponse);

    // Check security headers
    expect(result.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
    expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(result.headers.get('Permissions-Policy')).toBe('camera=(self "https://space.cachy.app"), microphone=(self "https://space.cachy.app"), xr-spatial-tracking=(self "https://space.cachy.app" *), display-capture=(self "https://space.cachy.app"), fullscreen=*, autoplay=*, accelerometer=*, gyroscope=*, clipboard-write=*, encrypted-media=*, picture-in-picture=*, web-share=*, geolocation=*');
  });
});

describe('handle sequence (Integration)', () => {
  it('should execute loggingHandler and headersHandler in sequence', async () => {
    // Arrange
    const mockRequest = new Request('http://localhost/test-path', {
      method: 'GET'
    });

    const mockEvent = {
      request: mockRequest,
      url: new URL('http://localhost/test-path'),
      cookies: { get: vi.fn() }
    } as unknown as RequestEvent;

    // Create a mock response
    const mockResponse = new Response('<html><head></head><body>Hello</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });

    const mockResolve = vi.fn().mockResolvedValue(mockResponse);
    const loggerInfoSpy = (await import('$lib/server/logger')).logger.info;

    // Act
    const result = await handle({ event: mockEvent, resolve: mockResolve });

    // Assert
    // 1. Check loggingHandler behavior
    expect(loggerInfoSpy).toHaveBeenCalledWith('[REQ] GET /test-path');
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/\[RES\] GET \/test-path -> 200 \(\d+ms\)/));

    // 2. Check headersHandler behavior
    expect(result.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
    expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

    // 3. Response body is delivered unchanged
    const bodyText = await result.text();
    expect(bodyText).toBe('<html><head></head><body>Hello</body></html>');
  });

  it('BUG-0281: should not allow HTML/markup injection via crafted cachy_theme cookie', async () => {
    const maliciousPayload = 'x"><img src=x onerror=alert(1)>$&$\'';
    const mockRequest = new Request('http://localhost/test-path', { method: 'GET' });
    const mockCookies = {
      get: vi.fn().mockImplementation((key) => {
        if (key === CONSTANTS.LOCAL_STORAGE_THEME_KEY) return maliciousPayload;
        return null;
      })
    };
    const mockEvent = {
      request: mockRequest,
      url: new URL('http://localhost/test-path'),
      cookies: mockCookies
    } as unknown as RequestEvent;

    const baseHtml = '<!DOCTYPE html><html><head></head><body class="min-h-screen"><div>App</div></body></html>';
    const mockResponse = new Response(baseHtml, {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });

    const mockResolve = vi.fn().mockImplementation(async (event, opts) => {
      if (opts && opts.transformPageChunk) {
        const transformedHtml = opts.transformPageChunk({
          html: baseHtml,
          done: true
        });
        return new Response(transformedHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return mockResponse;
    });

    const result = await handle({ event: mockEvent, resolve: mockResolve });
    const bodyText = await result.text();

    // Must not inject attacker markup or quote-breakout into body tag
    expect(bodyText).not.toContain('<img');
    expect(bodyText).not.toContain('onerror=');
    expect(bodyText).not.toContain(maliciousPayload);
    // HTML should remain unmodified outside of authorized behavior
    expect(bodyText).toBe(baseHtml);
  });

  it('should log warnings for 429/401 and errors for other 4xx/5xx responses', async () => {
    const mockCookies = {
      get: vi.fn().mockReturnValue('dark')
    };

    const createEvent = (path: string) => ({
      request: new Request(`http://localhost${path}`, { method: 'GET' }),
      url: new URL(`http://localhost${path}`),
      cookies: mockCookies
    } as unknown as RequestEvent);

    const { logger: mockLogger } = await import('$lib/server/logger');

    // Test 429 (Rate Limit) -> should warn
    const resolve429 = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    await handle({ event: createEvent('/api/data'), resolve: resolve429 });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringMatching(/\[RES\] GET \/api\/data -> 429 \(\d+ms\)/));

    vi.clearAllMocks();

    // Test 401 (Unauthorized) -> should warn
    const resolve401 = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await handle({ event: createEvent('/api/auth'), resolve: resolve401 });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringMatching(/\[RES\] GET \/api\/auth -> 401 \(\d+ms\)/));

    vi.clearAllMocks();

    // Test 500 (Server Error) -> should error
    const resolve500 = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }));
    await handle({ event: createEvent('/api/fail'), resolve: resolve500 });
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/\[RES\] GET \/api\/fail -> 500 \(\d+ms\)/));
  });
});
