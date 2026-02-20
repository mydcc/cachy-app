import { vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: {
    APP_ACCESS_TOKEN: 'test-token-123'
  }
}));

// Mock localStorage for node environment
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
global.localStorage = localStorageMock as any;
