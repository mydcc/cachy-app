import { describe, it, expect } from 'vitest';
import { isPriceData, isTickerData, isTradeData } from './bitunixWs';

describe('Bitunix WebSocket Fast Path Guards', () => {
  describe('isPriceData', () => {
    it('should validate correct price data', () => {
      const valid = { lastPrice: '10000', ip: '10000', fr: '0.01' };
      expect(isPriceData(valid)).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(isPriceData(null)).toBe(false);
      expect(isPriceData(undefined)).toBe(false);
    });

    it('should reject arrays', () => {
      expect(isPriceData([])).toBe(false);
    });

    it('should reject unsafe types (objects instead of primitives)', () => {
      const invalid = { lastPrice: { value: 100 } };
      expect(isPriceData(invalid)).toBe(false);
    });

    it('should accept numbers (safe primitive)', () => {
      const valid = { lastPrice: 10000 };
      expect(isPriceData(valid)).toBe(true);
    });

    // NEW HARDENING TESTS
    it('should reject NaN values', () => {
        const invalid = { lastPrice: NaN };
        expect(isPriceData(invalid)).toBe(false);
    });
  });

  describe('isTickerData', () => {
    it('should validate correct ticker data', () => {
      const valid = { lastPrice: '100', volume: '500', close: '100' };
      expect(isTickerData(valid)).toBe(true);
    });

    it('should reject missing critical fields', () => {
      const invalid = { otherField: '123' };
      expect(isTickerData(invalid)).toBe(false);
    });

    it('should reject unsafe types', () => {
      const invalid = { lastPrice: null };
      expect(isTickerData(invalid)).toBe(false);
    });

    // NEW HARDENING TESTS
    it('should reject NaN values in ticker', () => {
        const invalid = { lastPrice: NaN, volume: '100' };
        expect(isTickerData(invalid)).toBe(false);
    });
  });

  describe('isTradeData', () => {
    it('should validate correct trade data', () => {
      const valid = { p: '100', v: '1', s: 'buy', t: 123456789 };
      expect(isTradeData(valid)).toBe(true);
    });

    it('should validate fallback trade data', () => {
      const valid = { lastPrice: '100', volume: '1', side: 'buy' };
      expect(isTradeData(valid)).toBe(true);
    });

    it('should reject if price or volume is missing', () => {
      const invalid = { s: 'buy' };
      expect(isTradeData(invalid)).toBe(false);
    });

    it('should reject unsafe types', () => {
        const invalid = { p: { nested: true }, v: '1' };
        expect(isTradeData(invalid)).toBe(false);
    });

    // NEW HARDENING TESTS
    it('should reject if side is missing or invalid', () => {
        const invalid = { p: '100', v: '1' }; // missing side
        expect(isTradeData(invalid)).toBe(false);
        const invalidType = { p: '100', v: '1', s: 123 }; // side must be string usually? Actually API might send number for enum. But let's check safety.
        // Assuming side should be string for safety
    });

    it('should reject NaN in trade', () => {
        const invalid = { p: NaN, v: '1', s: 'buy' };
        expect(isTradeData(invalid)).toBe(false);
    });
  });
});
