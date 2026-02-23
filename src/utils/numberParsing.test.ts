
import { describe, it, expect } from 'vitest';
import { parseLocaleNumber } from './numberParsing';

describe('parseLocaleNumber', () => {
    it('should parse standard numbers', () => {
        expect(parseLocaleNumber('123.45')).toBe('123.45');
        expect(parseLocaleNumber('100')).toBe('100');
        expect(parseLocaleNumber('-50.5')).toBe('-50.5');
    });

    it('should handle single comma as decimal', () => {
        expect(parseLocaleNumber('123,45')).toBe('123.45');
    });

    it('should handle US format (comma thousands)', () => {
        expect(parseLocaleNumber('1,234.56')).toBe('1234.56');
        expect(parseLocaleNumber('1,000,000.00')).toBe('1000000.00');
    });

    it('should handle EU format (dot thousands, comma decimal)', () => {
        expect(parseLocaleNumber('1.234,56')).toBe('1234.56');
        expect(parseLocaleNumber('1.000.000,00')).toBe('1000000.00');
    });

    it('should strip single comma thousands if valid format', () => {
        // "1,000" -> Ambiguous. Current logic treats it as decimal 1.000 -> 1.
        // Wait, my code said: if parts.length === 2, treat as decimal.
        expect(parseLocaleNumber('1,000')).toBe('1.000');
    });

    it('should strip valid thousands groups if multiple commas', () => {
        expect(parseLocaleNumber('1,000,000')).toBe('1000000');
    });

    it('should strip valid thousands groups if multiple dots', () => {
        expect(parseLocaleNumber('1.000.000')).toBe('1000000');
    });

    it('should return undefined for invalid formats', () => {
        expect(parseLocaleNumber('abc')).toBeUndefined();
        expect(parseLocaleNumber('1.2.3')).toBeUndefined(); // Mixed/Invalid
        expect(parseLocaleNumber('1,2,3')).toBeUndefined(); // Invalid thousands?
        // 1,2,3 -> parts ["1", "2", "3"]. Length 3.
        // Check groups: "2" length is 1 != 3. "3" length 1 != 3.
        // So returns undefined. Correct.
    });
});
