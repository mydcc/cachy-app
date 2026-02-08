import { describe, it, expect } from 'vitest';
import { isTickerData, isTradeData } from './bitunixWs';

describe('BitunixWs Type Guards Hardening', () => {
    it('should reject ticker with object values for "v"', () => {
        const unsafe = { v: { malicious: true }, lastPrice: "100" };
        expect(isTickerData(unsafe)).toBe(false);
    });

    it('should reject trade with null values for "p"', () => {
        const unsafe = { p: null, v: "10" };
        expect(isTradeData(unsafe)).toBe(false);
    });

    it('should reject trade with object values for "v"', () => {
        const unsafe = { p: "100", v: {} };
        expect(isTradeData(unsafe)).toBe(false);
    });
});
