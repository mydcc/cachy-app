import { describe, it, expect } from 'vitest';
import { mdaService } from './mdaService';

describe('mdaService Data Hardening', () => {
  it('should normalize numeric inputs to strings for Bitunix', () => {
    // Simulate what happens when JSON.parse creates numbers
    const raw = {
      symbol: 'BTCUSDT',
      data: {
        lastPrice: 50000.50, // Number
        highPrice: 51000,
        lowPrice: 49000,
        volume: 1000.123
      }
    };

    const normalized = mdaService.normalizeTicker(raw, 'bitunix');

    // Assert strict string type
    expect(typeof normalized.lastPrice).toBe('string');
    expect(normalized.lastPrice).toBe('50000.5'); // JS default stringification
    expect(typeof normalized.volume).toBe('string');
    expect(normalized.volume).toBe('1000.123');
  });

  it('should handle string inputs correctly (preserving precision)', () => {
    const raw = {
      symbol: 'BTCUSDT',
      data: {
        lastPrice: "50000.500000001", // High precision string
        volume: "1000.123"
      }
    };
    const normalized = mdaService.normalizeTicker(raw, 'bitunix');

    expect(typeof normalized.lastPrice).toBe('string');
    expect(normalized.lastPrice).toBe('50000.500000001'); // Should not round
  });

  it('should handle null/undefined safely', () => {
     const raw = { symbol: 'BTCUSDT', data: {} };
     const normalized = mdaService.normalizeTicker(raw, 'bitunix');
     expect(normalized.lastPrice).toBe('0');
     expect(normalized.volume).toBe('0');
  });

  it('should handle fast-path flat objects', () => {
      // Bitunix fast path might pass flat object
      const raw = {
          symbol: 'ETHUSDT',
          lp: 3000.55 // Number alias
      };

      const normalized = mdaService.normalizeTicker(raw, 'bitunix');
      expect(normalized.lastPrice).toBe('3000.55');
      expect(typeof normalized.lastPrice).toBe('string');
  });
});
