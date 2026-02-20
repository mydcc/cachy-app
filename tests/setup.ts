import { vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: {
    APP_ACCESS_TOKEN: 'test-token-123'
  }
}));
