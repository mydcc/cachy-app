import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Import the real signature function to mock if needed, or just let it run
// Since the refactor uses generateBitunixSignature, we might need to mock crypto or ensure it works.
// Node's crypto is available in vitest environment usually.

describe('POST /api/sync/positions-history - Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sanitize API key in logs and response on error', async () => {
    const apiKey = 'SENSITIVE_API_KEY_12345';
    const apiSecret = 'SENSITIVE_API_SECRET_67890';
    const errorMsg = `Invalid API Key: ${apiKey}`; // Simulate upstream error leaking key

    // Mock fetch to fail with sensitive info in the body
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: async () => errorMsg,
      status: 400,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = {
      json: async () => ({ apiKey, apiSecret, limit: 10 }),
    } as Request;

    const response = await POST({ request } as any);
    const body = await response.json();

    // Verify fetch was called
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Verify console.error was called
    expect(consoleSpy).toHaveBeenCalled();
    const loggedArgs = consoleSpy.mock.calls[0];
    const loggedMessage = loggedArgs.join(' ');

    // Vulnerability Check: Ideally, we want these to NOT contain the key.
    expect(loggedMessage).not.toContain(apiKey);
    expect(loggedMessage).toContain('***'); // Check for mask
    expect(body.error).not.toContain(apiKey);
    expect(body.error).toContain('***');
  });

  it('should work correctly with valid credentials', async () => {
     fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, data: { positionList: [] } }),
    });

    const request = {
      json: async () => ({ apiKey: 'validApiKey', apiSecret: 'validSecret', limit: 10 }),
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });
});
