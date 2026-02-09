
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

describe('TP/SL API Validation', () => {
  const validKey = '12345678901234567890'; // > 10 chars
  const validSecret = '12345678901234567890';

  it('should reject requests with invalid structure', async () => {
    const request = {
      json: async () => ({
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
      json: async () => ({
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
      json: async () => ({
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
      json: async () => ({
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
    (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: [] })
    });

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
  });

  it('should accept valid modify request', async () => {
    const request = {
      json: async () => ({
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
    (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: {} })
    });

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
  });
});
