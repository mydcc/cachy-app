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
import { POST } from './+server';

// Set env var for Auth fallback
process.env.APP_ACCESS_TOKEN = 'test-token-123';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('POST /api/sync/positions-history - Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const headers = new Map([['x-app-access-token', 'test-token-123']]);

  it('should sanitize API key in logs and response on error', async () => {
    // Force API error
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API Key provided',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = {
      json: async () => ({
        apiKey: 'SECRET_KEY_123',
        apiSecret: 'SECRET_SECRET_456'
      }),
      headers
    } as any;

    const response = await POST({ request } as any);
    const body = await response.json();

    // Verify fetch was called
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify console.error was called
    expect(consoleSpy).toHaveBeenCalled();
    const logCalls = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');

    // Ensure API Key is NOT in logs
    expect(logCalls).not.toContain('SECRET_KEY_123');
    expect(logCalls).not.toContain('SECRET_SECRET_456');

    expect(body.error).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('should work correctly with valid credentials', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: [] }), // bitunix format
    });

    const request = {
      json: async () => ({
        apiKey: 'valid_key',
        apiSecret: 'valid_secret'
      }),
      headers
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });
});
