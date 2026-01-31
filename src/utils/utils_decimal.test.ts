import { describe, it, expect } from 'vitest';
import { parseDecimal } from './utils';

describe('parseDecimal Integrity', () => {
    it('should parse standard English float', () => {
        expect(parseDecimal("1234.56").toNumber()).toBe(1234.56);
    });

    it('should parse standard German float', () => {
        expect(parseDecimal("1234,56").toNumber()).toBe(1234.56);
    });

    it('should parse German thousands with decimal', () => {
        expect(parseDecimal("1.234,56").toNumber()).toBe(1234.56);
    });

    it('should parse English thousands with decimal', () => {
        expect(parseDecimal("1,234.56").toNumber()).toBe(1234.56);
    });

    // The Critical Ambiguity
    it('should handle "1,234" safely', () => {
        // New logic: English Thousands assumption
        expect(parseDecimal("1,234").toNumber()).toBe(1234);
    });

    it('should handle "1,000" safely', () => {
        // New logic: English Thousands assumption
        expect(parseDecimal("1,000").toNumber()).toBe(1000);
    });

    it('should still handle "1,2" as decimal', () => {
        expect(parseDecimal("1,2").toNumber()).toBe(1.2);
    });

    it('should still handle "1,2345" as decimal', () => {
        expect(parseDecimal("1,2345").toNumber()).toBe(1.2345);
    });
});
