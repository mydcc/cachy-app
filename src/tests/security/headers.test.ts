import { describe, it, expect, vi } from 'vitest';
import { headersHandler } from '../../hooks.server';
import type { RequestEvent } from '@sveltejs/kit';

describe('Security Headers', () => {
  it('should set security headers', async () => {
    // Mock the resolve function to return a basic response
    const resolve = vi.fn().mockResolvedValue(new Response('ok'));

    // Mock the event object
    const event = {
      request: new Request('http://localhost/'),
      url: new URL('http://localhost/'),
      cookies: {
        get: () => null,
      },
    } as unknown as RequestEvent;

    // Call the headersHandler function
    const response = await headersHandler({ event, resolve });

    // Verify headers
    const headers = response.headers;

    // Existing header
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');

    // Missing headers (these should fail initially)
    expect(headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });
});
