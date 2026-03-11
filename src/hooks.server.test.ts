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

import { describe, it, expect, vi } from 'vitest';
import { headersHandler } from './hooks.server';
import type { RequestEvent } from '@sveltejs/kit';

// Mock the dependencies
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
