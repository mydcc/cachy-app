import { describe, it, expect } from 'vitest';
import { parseDecimal } from './utils';
import { Decimal } from 'decimal.js';

describe('Input Parsing Vulnerability (Reproduction)', () => {
    // 🔴 CRITICAL: The "1,000 -> 1" Bug
    it('should correctly parse English thousands separator "1,000" as 1000', () => {
        const input = "1,000";
        const result = parseDecimal(input);
        // CURRENTLY FAILS: parses as 1
        expect(result.toNumber()).toBe(1000);
    });

    it('should correctly parse German format "1.000,50" as 1000.5', () => {
        const input = "1.000,50";
        const result = parseDecimal(input);
        expect(result.toNumber()).toBe(1000.5);
    });

    it('should correctly parse English format "1,000.50" as 1000.5', () => {
        const input = "1,000.50";
        const result = parseDecimal(input);
        expect(result.toNumber()).toBe(1000.5);
    });

    it('should correctly parse "1,234" as 1234 (Ambiguous but assume EN thousands if 3 digits)', () => {
        const input = "1,234";
        const result = parseDecimal(input);
        // CURRENTLY FAILS: parses as 1.234
        expect(result.toNumber()).toBe(1234);
    });

    it('should correctly parse "1,2" as 1.2 (Decimal)', () => {
        const input = "1,2";
        const result = parseDecimal(input);
        expect(result.toNumber()).toBe(1.2);
    });
});
