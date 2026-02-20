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

// Mock Bitunix API helpers
vi.mock('../../../utils/server/bitunix', () => ({
  validateBitunixKeys: vi.fn((key, secret) => {
    if (!key || !secret) return 'Missing Credentials';
    return null;
  }),
  fetchBitunixAccount: vi.fn(async () => ({
    available: "100",
    margin: "10",
    totalUnrealizedPnL: "5",
    // ...other fields mocked minimally
  }))
}));

// Mock Bitget API helpers
vi.mock('../../../utils/server/bitget', () => ({
  validateBitgetKeys: vi.fn(() => null),
  fetchBitgetAccount: vi.fn(async () => ({}))
}));

describe('POST /api/account Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ACCESS_TOKEN = 'test-token-123';
  });

  const headers = new Map([['x-app-access-token', 'test-token-123']]);

  it('should handle malformed JSON body gracefully', async () => {
    // Mock text() to return invalid JSON string
    const request = {
      text: async () => '{ "broken": ',
      headers,
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.objectContaining({
        code: 'INVALID_JSON',
        message: 'Invalid JSON body'
    }));
  });

  it('should handle non-object body gracefully (Zod Validation)', async () => {
    // Mock text() to return valid JSON but invalid schema (null)
    const request = {
      text: async () => 'null',
      headers,
    } as any;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toEqual(expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Validation Error'
    }));
  });

  it('should process valid request correctly', async () => {
    const validBody = {
        exchange: 'bitunix',
        apiKey: 'key',
        apiSecret: 'secret'
    };
    const request = {
      text: async () => JSON.stringify(validBody),
      headers: new Map([
          ['x-app-access-token', 'test-token-123'],
          ['x-api-key', 'key'],
          ['x-api-secret', 'secret']
      ]),
    } as any;

    const response = await POST({ request } as any);
    if (response.status !== 200) {
        const body = await response.json();
        console.error("Account Valid Req Failed:", body);
    }
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.available).toBe("100");
  });
});
