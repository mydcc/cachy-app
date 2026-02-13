import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server';

describe('POST /api/sync/orders', () => {
  it('should return 400 if JSON is malformed', async () => {
    const request = {
      json: async () => {
        throw new Error('Unexpected end of JSON input');
      },
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid JSON');
  });

  it('should return 400 if credentials are missing', async () => {
    const request = {
      json: async () => ({ limit: 10 }),
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request data');
  });

  it('should return 400 if limit is not a number', async () => {
    const request = {
      json: async () => ({ apiKey: 'key', apiSecret: 'secret', limit: 'invalid' }),
    } as Request;

    const response = await POST({ request } as any);
    expect(response.status).toBe(400);
  });
});
