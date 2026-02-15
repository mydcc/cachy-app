import { describe, it, expect, vi } from 'vitest';
import { checkAppAuth } from '../src/lib/server/auth';

// Mock SvelteKit modules
vi.mock('$env/dynamic/private', () => ({
  env: {
    APP_ACCESS_TOKEN: undefined
  }
}));

vi.mock('@sveltejs/kit', () => ({
  json: vi.fn((data, init) => ({
    status: init?.status || 200,
    json: async () => data
  }))
}));

describe('checkAppAuth fail-closed validation', () => {
  it('should DENY access when APP_ACCESS_TOKEN is missing', () => {
    const request = new Request('http://localhost/api/test', {
      headers: {}
    });

    const result = checkAppAuth(request);

    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });
});
