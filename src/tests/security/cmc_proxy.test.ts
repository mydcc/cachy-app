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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../routes/api/external/cmc/+server';

// Set env var for Auth fallback
process.env.APP_ACCESS_TOKEN = 'test-token-123';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('CMC Proxy Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ACCESS_TOKEN = 'test-token-123';
    // Stub Env via vi.stubEnv to ensure it's picked up
    vi.stubEnv('APP_ACCESS_TOKEN', 'test-token-123');
  });

  const headers = new Map([
      ['x-app-access-token', 'test-token-123'],
      ['x-cmc-api-key', 'cmc-key'] // Required by endpoint
  ]);

  it('should allow whitelisted endpoints', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'ok' }),
    });

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/cryptocurrency/quotes/latest&symbol=BTC');
    const request = { headers } as any;

    const response = await GET({ request, url } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: 'ok' });
  });

  it('should block non-whitelisted endpoints', async () => {
    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/admin/users');
    const request = { headers } as any;

    const response = await GET({ request, url } as any);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Endpoint not allowed');
  });

  it('should prevent path traversal', async () => {
    const url = new URL('http://localhost/api/external/cmc?endpoint=../etc/passwd');
    const request = { headers } as any;

    const response = await GET({ request, url } as any);
    // If vulnerable, this will be 200. We want 403.
    expect(response.status).toBe(403);
  });
});
