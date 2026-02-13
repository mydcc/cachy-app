import { describe, it, expect } from 'vitest';
import { isTradeData } from './bitunixWs';

describe('BitunixWs Type Guards Hardening', () => {
    it('should reject trade with null values for "p"', () => {
        const unsafe = { p: null, v: "10" };
        expect(isTradeData(unsafe)).toBe(false);
    });

    it('should reject trade with object values for "v"', () => {
        const unsafe = { p: "100", v: {} };
        expect(isTradeData(unsafe)).toBe(false);
    });
});
