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
import { POST } from '../../src/routes/api/tpsl/+server';

// Mock helpers
vi.mock('../../src/utils/server/bitunix', () => ({
  validateBitunixKeys: vi.fn((key, secret) => {
    if (key === 'invalid' || secret === 'invalid') return 'Invalid keys';
    return null;
  }),
  generateBitunixSignature: vi.fn(() => ({
    nonce: 'nonce',
    timestamp: '1234567890',
    signature: 'signature',
    queryString: '',
    bodyStr: '{}'
  }))
}));

vi.mock('../../src/lib/server/auth', () => ({
  checkAppAuth: vi.fn(() => null) // Allow all
}));

// Mock global fetch
global.fetch = vi.fn();

// The route reads the body with safeJsonParse(await request.text()) rather than
// request.json(), deliberately: JSON.parse mangles the precision of large numeric
// literals, which matters for prices and sizes. These mocks previously provided
// only json(), so every request threw "request.text is not a function" and the
// route answered 500 instead of the status under test.
describe('TP/SL API Validation', () => {
  const validKey = '12345678901234567890'; // > 10 chars
  const validSecret = '12345678901234567890';

  it('should reject requests with invalid structure', async () => {
    const request = {
      // A real Request always has headers; extractApiCredentials reads them
      // before falling back to the body. An empty Headers instance keeps that
      // fallback path exercised without pretending headers are absent.
      headers: new Headers(),
      text: async () => JSON.stringify({
        exchange: 'bitunix',
        // Missing keys
      })
    };

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation Error');
  });

  it('should reject requests with invalid action', async () => {
    const request = {
      // A real Request always has headers; extractApiCredentials reads them
      // before falling back to the body. An empty Headers instance keeps that
      // fallback path exercised without pretending headers are absent.
      headers: new Headers(),
      text: async () => JSON.stringify({
        exchange: 'bitunix',
        apiKey: validKey,
        apiSecret: validSecret,
        action: 'hack', // Invalid enum
        params: {}
      })
    };

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation Error');
  });

  it('should reject modify action without required params', async () => {
    const request = {
      // A real Request always has headers; extractApiCredentials reads them
      // before falling back to the body. An empty Headers instance keeps that
      // fallback path exercised without pretending headers are absent.
      headers: new Headers(),
      text: async () => JSON.stringify({
        exchange: 'bitunix',
        apiKey: validKey,
        apiSecret: validSecret,
        action: 'modify',
        params: {
            symbol: 'BTCUSDT'
            // Missing orderId, planType, triggerPrice
        }
      })
    };

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation Error');
  });

  it('should accept valid pending request', async () => {
    const request = {
      // A real Request always has headers; extractApiCredentials reads them
      // before falling back to the body. An empty Headers instance keeps that
      // fallback path exercised without pretending headers are absent.
      headers: new Headers(),
      text: async () => JSON.stringify({
        exchange: 'bitunix',
        apiKey: validKey,
        apiSecret: validSecret,
        action: 'pending',
        params: {
            symbol: 'BTCUSDT'
        }
      })
    };

    // Mock successful fetch for logic flow
    vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        // The route reads the upstream body with response.json() on the success
        // path and response.text() only in the error branch, so the mock needs
        // both to stand in for a real Response.
        json: async () => ({ code: 0, data: [] }),
        text: async () => JSON.stringify({ code: 0, data: [] })
    });

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
  });

  it('should accept valid modify request', async () => {
    const request = {
      // A real Request always has headers; extractApiCredentials reads them
      // before falling back to the body. An empty Headers instance keeps that
      // fallback path exercised without pretending headers are absent.
      headers: new Headers(),
      text: async () => JSON.stringify({
        exchange: 'bitunix',
        apiKey: validKey,
        apiSecret: validSecret,
        action: 'modify',
        params: {
            orderId: '12345',
            symbol: 'BTCUSDT',
            planType: 'PROFIT',
            triggerPrice: '90000',
            qty: '0.1'
        }
      })
    };

    // Mock successful fetch
    vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: {} }),
        text: async () => JSON.stringify({ code: 0, data: {} })
    });

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
  });
});
