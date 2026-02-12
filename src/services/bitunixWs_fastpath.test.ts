import { describe, it, expect } from 'vitest';
import { StrictPriceDataSchema, StrictTickerDataSchema } from '../types/bitunixValidation';

describe('BitunixWS Strict Validation (Hardening)', () => {
  describe('StrictPriceDataSchema', () => {
    it('should accept valid string price data', () => {
      const valid = { lastPrice: "100.5", fr: "0.01" };
      const res = StrictPriceDataSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('should accept valid numeric price data (and coerce to string)', () => {
      const valid = { lastPrice: 100.5 };
      const res = StrictPriceDataSchema.safeParse(valid);
      expect(res.success).toBe(true);
      if (res.success) {
          expect(res.data.lastPrice).toBe("100.5");
      }
    });

    it('should accept abbreviated keys (lp, ip)', () => {
      const valid = { lp: "100" };
      const res = StrictPriceDataSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('should reject null', () => {
      const res = StrictPriceDataSchema.safeParse(null);
      expect(res.success).toBe(false);
    });

    it('should reject undefined', () => {
      const res = StrictPriceDataSchema.safeParse(undefined);
      expect(res.success).toBe(false);
    });

    it('should allow empty object (all fields optional)', () => {
       // Since all fields are optional, empty object is technically valid per schema structure
       // but business logic checks for specific fields.
       // The Schema just validates types if present.
       const res = StrictPriceDataSchema.safeParse({});
       expect(res.success).toBe(true);
    });

    it('should reject arrays', () => {
        const res = StrictPriceDataSchema.safeParse([]);
        expect(res.success).toBe(false);
    });
  });

  describe('StrictTickerDataSchema', () => {
    it('should accept valid ticker', () => {
      const valid = { volume: "1000", lastPrice: "500" };
      const res = StrictTickerDataSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('should coerce numbers in ticker', () => {
        const valid = { v: 1000, q: 500 };
        const res = StrictTickerDataSchema.safeParse(valid);
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.v).toBe("1000");
            expect(res.data.q).toBe("500");
        }
    });
  });
});
