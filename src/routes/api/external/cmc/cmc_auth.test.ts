import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import { checkAppAuth } from '../../../../lib/server/auth';
import { json } from '@sveltejs/kit';

vi.mock('../../../../lib/server/auth', () => ({
  checkAppAuth: vi.fn(),
}));

describe('CMC Proxy Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when checkAppAuth fails', async () => {
    const authError = json({ error: 'Unauthorized' }, { status: 401 });
    vi.mocked(checkAppAuth).mockReturnValue(authError);

    const request = {
      headers: new Headers(),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request } as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
    expect(checkAppAuth).toHaveBeenCalledWith(request);
  });

  it('should proceed when checkAppAuth succeeds', async () => {
    vi.mocked(checkAppAuth).mockReturnValue(null);

    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' })
    });
    global.fetch = fetchMock;

    const request = {
      headers: new Headers({ 'x-cmc-api-key': 'test-key' }),
    } as unknown as Request;

    const url = new URL('http://localhost/api/external/cmc?endpoint=/v1/global-metrics/quotes/latest');

    const response = await GET({ url, request } as any);

    expect(response.status).toBe(200);
    expect(checkAppAuth).toHaveBeenCalledWith(request);
  });
});
