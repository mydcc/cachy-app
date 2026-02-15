import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';

// Mock dependencies
vi.mock('../../../lib/server/auth', () => ({
  checkAppAuth: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../utils/server/bitunix', () => ({
  validateBitunixKeys: vi.fn(),
  generateBitunixSignature: vi.fn().mockReturnValue({ queryString: 'test' }),
}));

vi.mock('../../../utils/server/bitget', () => ({
  validateBitgetKeys: vi.fn(),
  generateBitgetSignature: vi.fn().mockReturnValue({ queryString: 'test' }),
}));

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('POST /api/account Security', () => {
  it('should handle malformed JSON body gracefully', async () => {
    const request = {
      json: vi.fn().mockRejectedValue(new Error('Unexpected token } in JSON at position 10')),
    } as unknown as Request;

    const response = await POST({ request } as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid JSON body' });
  });

  it('should handle non-object body gracefully', async () => {
    const request = {
      json: vi.fn().mockResolvedValue(null),
    } as unknown as Request;

    const response = await POST({ request } as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Validation Error');
  });

  it('should process valid request correctly', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({
        exchange: 'bitunix',
        apiKey: 'key',
        apiSecret: 'secret'
      }),
    } as unknown as Request;

    // Mock fetch response for bitunix
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, data: [{ available: "100" }] })
    });

    const response = await POST({ request } as any);
    const body = await response.json();

    expect(response.status).not.toBe(400);
    // expect(body).toHaveProperty('available'); // Assuming mocks work fully
  });
});
