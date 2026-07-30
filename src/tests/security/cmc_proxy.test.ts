/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error -- route module import without its generated $types, which are unavailable outside the SvelteKit build
import { GET } from '../../routes/api/external/cmc/+server';

// checkAppAuth now fails closed (ADR-0002), so this suite must supply a token —
// otherwise every request is rejected at the auth layer and the whitelist and
// path-traversal behaviour under test is never reached.
const mockEnv = vi.hoisted(() => ({ APP_ACCESS_TOKEN: 'test-app-token' }));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

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
      headers: { 'x-cmc-api-key': 'test-key', 'x-app-access-token': 'test-app-token' }
    });

    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ data: 'ok' })));

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: 'ok' });
  });

  it('should block non-whitelisted endpoints', async () => {
    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/unknown');
    const request = new Request(url, {
      headers: { 'x-cmc-api-key': 'test-key', 'x-app-access-token': 'test-app-token' }
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
      headers: { 'x-cmc-api-key': 'test-key', 'x-app-access-token': 'test-app-token' }
    });

    // Mock successful fetch to simulate successful exploitation if passed through
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({ secret: 'exposed' })));

    const response = await GET({ request, url } as any);

    // If vulnerable, this will be 200. We want 403.
    expect(response.status).toBe(403);
  });
});
