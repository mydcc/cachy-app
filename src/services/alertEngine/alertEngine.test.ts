import { describe, it, expect, vi } from 'vitest';
import { alertEngine } from './alertEngine';

vi.mock('../logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('AlertEngine Service', () => {
    it('initializes and handles evaluation gracefully if wasm not loaded', () => {
        expect(() => alertEngine.evaluate("BTCUSDT", 60000.0, 1)).not.toThrow();
    });
});
