import { describe, it, expect } from 'vitest';
import { isPriceData, isTickerData, isTradeData } from './bitunixWs';

describe('BitunixWS Fast Path Type Guards', () => {
  describe('isPriceData', () => {
    it('should accept valid string price data', () => {
      const valid = { lastPrice: "100.5", fr: "0.01" };
      expect(isPriceData(valid)).toBe(true);
    });

    it('should accept valid numeric price data', () => {
      const valid = { lastPrice: 100.5 };
      expect(isPriceData(valid)).toBe(true);
    });

    it('should accept abbreviated keys (lp, ip)', () => {
      const valid = { lp: "100" };
      expect(isPriceData(valid)).toBe(true);
    });

    it('should reject null', () => {
      expect(isPriceData(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isPriceData(undefined)).toBe(false);
    });

    it('should reject empty object', () => {
      expect(isPriceData({})).toBe(false);
    });

    it('should reject NaN values', () => {
      const invalid = { lastPrice: NaN };
      expect(isPriceData(invalid)).toBe(false);
    });

    it('should reject Infinity', () => {
        const invalid = { lastPrice: Infinity };
        expect(isPriceData(invalid)).toBe(false);
    });

    it('should reject arrays', () => {
        expect(isPriceData([])).toBe(false);
    });
  });

  describe('isTickerData', () => {
    it('should accept valid ticker', () => {
      const valid = { volume: "1000", lastPrice: "500" };
      expect(isTickerData(valid)).toBe(true);
    });

    it('should accept abbreviated ticker keys', () => {
        const valid = { v: "1000", q: "500" };
        expect(isTickerData(valid)).toBe(true);
    });

    it('should reject NaN in critical fields', () => {
      const invalid = { lastPrice: NaN };
      expect(isTickerData(invalid)).toBe(false);
    });
  });

  describe('isTradeData', () => {
      it('should accept valid trade', () => {
          const valid = { p: "100", v: "1" };
          expect(isTradeData(valid)).toBe(true);
      });

      it('should reject missing price', () => {
          const invalid = { v: "1" };
          expect(isTradeData(invalid)).toBe(false);
      });

      it('should reject NaN price', () => {
          const invalid = { p: NaN, v: "1" };
          expect(isTradeData(invalid)).toBe(false);
      });
  });
});
