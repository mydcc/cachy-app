import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';
import crypto from 'node:crypto';

// Mock dependencies
vi.mock('$lib/server/logger', () => ({
  logger: {
    on: vi.fn(),
    off: vi.fn(),
    log: vi.fn(),
  },
}));

vi.mock('$env/dynamic/private', () => ({
  env: {
    LOG_STREAM_KEY: 'secret-key',
  },
}));

describe('GET /api/stream-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 403 if LOG_STREAM_KEY is not set', async () => {
    const envModule = await import('$env/dynamic/private');
    envModule.env.LOG_STREAM_KEY = undefined;

    const request = new Request('http://localhost/api/stream-logs');
    const url = new URL('http://localhost/api/stream-logs');

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Log streaming is disabled');
  });

  it('should return 401 if token is incorrect', async () => {
    const envModule = await import('$env/dynamic/private');
    envModule.env.LOG_STREAM_KEY = 'secret-key';

    const url = new URL('http://localhost/api/stream-logs?token=wrong-token');
    const request = new Request(url);

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });

  it('should return 200 and stream if token is correct', async () => {
    const envModule = await import('$env/dynamic/private');
    envModule.env.LOG_STREAM_KEY = 'secret-key';

    const url = new URL('http://localhost/api/stream-logs?token=secret-key');
    const request = new Request(url);

    // Mock signal to avoid issues if environment doesn't support it fully
    Object.defineProperty(request, 'signal', {
        value: {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            aborted: false,
        },
        writable: true,
    });

    const response = await GET({ request, url } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('should use timingSafeEqual for token comparison', async () => {
    const timingSafeEqualSpy = vi.spyOn(crypto, 'timingSafeEqual');
    const envModule = await import('$env/dynamic/private');
    envModule.env.LOG_STREAM_KEY = 'secret-key';

    // Use a token of same length to ensure timingSafeEqual is called (if length check is implemented)
    const url = new URL('http://localhost/api/stream-logs?token=wrong-key1');
    const request = new Request(url);

    await GET({ request, url } as any);

    expect(timingSafeEqualSpy).toHaveBeenCalled();
  });
});
