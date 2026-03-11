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

import { describe, it, expect, vi, afterAll } from 'vitest';
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
          resolve: async (e, opts) => next(e || currentEvent, opts || currentOptions)
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

// Save original console methods before the import patches them
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// Import after mocks are set up (vi.mock calls are hoisted automatically)
import { headersHandler, handle } from './hooks.server';

afterAll(() => {
  // Restore the original console methods to prevent cross-test contamination
  console.log = originalLog;
  console.warn = originalWarn;
  console.error = originalError;
  delete (global as any)._isConsolePatched;
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
    expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(result.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(result.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });
});

describe('handle sequence (Integration)', () => {
  it('should execute loggingHandler, headersHandler, and themeHandler in sequence', async () => {
    // Arrange

    // Import all the handlers
    const { default: hooks } = await import('./hooks.server');

    const mockRequest = new Request('http://localhost/test-path', {
      method: 'GET'
    });

    const mockCookies = {
      get: vi.fn().mockImplementation((key) => {
        if (key === 'cachy_theme') return 'light'; // Simulating a light theme
        return null;
      })
    };

    const mockEvent = {
      request: mockRequest,
      url: new URL('http://localhost/test-path'),
      cookies: mockCookies
    } as unknown as RequestEvent;

    // Create a mock response
    const mockResponse = new Response('<html><head></head><body>Hello</body></html>', { status: 200 });

    // Mock the inner resolve function
    // It should receive an options object with transformPageChunk from the themeHandler
    const mockResolve = vi.fn().mockImplementation(async (event, opts) => {
      if (opts && opts.transformPageChunk) {
        // Simulate SvelteKit calling the transformPageChunk function
        const transformedHtml = opts.transformPageChunk({
          html: '<html><head></head><body>Hello</body></html>',
          done: true
        });

        // Return a response with the transformed HTML body for our test assertion
        return new Response(transformedHtml, { status: 200 });
      }
      return mockResponse;
    });

    const loggerInfoSpy = (await import('$lib/server/logger')).logger.info;

    // Act
    const result = await handle({ event: mockEvent, resolve: mockResolve });

    // Assert
    // 1. Check loggingHandler behavior
    expect(loggerInfoSpy).toHaveBeenCalledWith('[REQ] GET /test-path');
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/\[RES\] GET \/test-path -> 200 \(\d+ms\)/));

    // 2. Check headersHandler behavior
    expect(result.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

    // 3. Check themeHandler behavior (transformPageChunk application)
    const bodyText = await result.text();
    expect(bodyText).toContain('<body class="theme-light">');
  });
});
