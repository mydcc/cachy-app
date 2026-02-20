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

describe('POST /api/sync/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const headers = new Map([['x-app-access-token', 'test-token-123']]);

  it('should return 400 if JSON is malformed', async () => {
    const request = {
      json: async () => { throw new Error('Invalid JSON'); },
      headers
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('should return 400 if credentials are missing', async () => {
    const request = {
      json: async () => ({ limit: 10 }),
      headers
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request data');
  });

  it('should return 400 if limit is not a number', async () => {
    const request = {
      json: async () => ({ apiKey: 'abc', apiSecret: 'def', limit: 'invalid' }),
      headers
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
  });
});
