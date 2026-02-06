import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore
import { GET } from '../../routes/api/external/cmc/+server';

describe('CMC Proxy Security', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    // Mock console to reduce noise
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow whitelisted endpoints', async () => {
    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');
    const request = new Request(url, {
      headers: { 'x-cmc-api-key': 'test-key' }
    });

    (global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ data: 'ok' })));

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: 'ok' });
  });

  it('should block non-whitelisted endpoints', async () => {
    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/unknown');
    const request = new Request(url, {
      headers: { 'x-cmc-api-key': 'test-key' }
    });

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Endpoint not allowed');
  });

  it('should prevent path traversal', async () => {
    const exploitEndpoint = '/v1/global-metrics/quotes/latest/../sensitive';
    const url = new URL(`http://localhost/api/external/cmc?endpoint=${encodeURIComponent(exploitEndpoint)}`);
    const request = new Request(url, {
      headers: { 'x-cmc-api-key': 'test-key' }
    });

    // Mock successful fetch to simulate successful exploitation if passed through
    (global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ secret: 'exposed' })));

    const response = await GET({ request, url } as any);

    // If vulnerable, this will be 200. We want 403.
    expect(response.status).toBe(403);
  });
});
