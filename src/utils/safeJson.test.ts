import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('safeJsonParse', () => {
    it('should parse simple JSON normally', () => {
        const json = '{"a": 1, "b": "text"}';
        const result = safeJsonParse(json);
        expect(result).toEqual({ a: 1, b: "text" });
    });

    it('should convert large integers (>= 15 chars) to strings', () => {
        const largeInt = "1234567890123456789"; // 19 chars
        const json = `{"id": ${largeInt}}`;
        const result = safeJsonParse(json);
        expect(result.id).toBe(largeInt);
        expect(typeof result.id).toBe('string');
    });

    it('should convert high precision floats (>= 15 chars) to strings', () => {
        const preciseFloat = "0.123456789012345"; // 17 chars
        const json = `{"price": ${preciseFloat}}`;
        const result = safeJsonParse(json);
        expect(result.price).toBe(preciseFloat);
        expect(typeof result.price).toBe('string');
    });

    it('should keep small numbers (< 15 chars) as numbers', () => {
        const smallInt = "12345678901234"; // 14 chars
        const json = `{"id": ${smallInt}}`;
        const result = safeJsonParse(json);
        expect(result.id).toBe(Number(smallInt));
        expect(typeof result.id).toBe('number');
    });

    it('should handle negative large numbers', () => {
        const negLarge = "-1234567890123456"; // 17 chars
        const json = `{"val": ${negLarge}}`;
        const result = safeJsonParse(json);
        expect(result.val).toBe(negLarge);
        expect(typeof result.val).toBe('string');
    });

    it('should handle scientific notation if length >= 15', () => {
        const sci = "1.23456789e+20"; // 14 chars -> Wait, regex is \d[\d.eE+-]{14,} meaning 1 digit + 14 chars = 15 total.
        // "1.23456789e+20" length is 14. So it should stay number.
        // Let's try longer.
        const longSci = "1.23456789012e+20"; // 17 chars
        const json = `{"sci": ${longSci}}`;
        const result = safeJsonParse(json);
        expect(result.sci).toBe(longSci);
        expect(typeof result.sci).toBe('string');
    });

    it('should handle arrays with large numbers', () => {
        const large1 = "1234567890123456";
        const small = "123";
        const large2 = "9876543210987654";
        const json = `[${large1}, ${small}, ${large2}]`;
        const result = safeJsonParse(json);
        expect(result[0]).toBe(large1);
        expect(typeof result[0]).toBe('string');
        expect(result[1]).toBe(123);
        expect(typeof result[1]).toBe('number');
        expect(result[2]).toBe(large2);
        expect(typeof result[2]).toBe('string');
    });

    it('should handle nested objects', () => {
        const large = "1234567890123456";
        const json = `{"data": {"id": ${large}, "values": [${large}]}}`;
        const result = safeJsonParse(json);
        expect(result.data.id).toBe(large);
        expect(result.data.values[0]).toBe(large);
    });

    it('should handle malformed json gracefully (throw standard error)', () => {
        const json = '{"a": }'; // Invalid
        expect(() => safeJsonParse(json)).toThrow();
    });
});
