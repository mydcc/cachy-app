import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('safeJsonParse', () => {
    it('parses standard JSON correctly', () => {
        const input = '{"a": 1, "b": "text"}';
        expect(safeJsonParse(input)).toEqual({ a: 1, b: "text" });
    });

    it('protects large integers (>= 15 digits)', () => {
        const input = '{"id": 1234567890123456789}';
        const result = safeJsonParse(input);
        expect(result.id).toBe("1234567890123456789");
    });

    it('protects large integers in arrays', () => {
        const input = '{"ids": [1234567890123456789, 9876543210987654321]}';
        const result = safeJsonParse(input);
        expect(result.ids[0]).toBe("1234567890123456789");
        expect(result.ids[1]).toBe("9876543210987654321");
    });

    it('handles negative large integers', () => {
         const input = '{"id": -1234567890123456789}';
         const result = safeJsonParse(input);
         expect(result.id).toBe("-1234567890123456789");
    });

    it('leaves small integers as numbers', () => {
        const input = '{"id": 12345678901234}'; // 14 digits
        const result = safeJsonParse(input);
        expect(typeof result.id).toBe("number");
        expect(result.id).toBe(12345678901234);
    });

    it('handles floating point numbers (preserves as string if long)', () => {
         // This behavior depends on the regex \d[\d.eE+-]{14,}
         // 1.23456789012345 is > 14 chars, so it should be stringified
         const input = '{"val": 1.234567890123456789}';
         const result = safeJsonParse(input);
         expect(result.val).toBe("1.234567890123456789");
    });

    it('handles scientific notation (preserves as string if long)', () => {
         const input = '{"val": 1.23e+20}'; // < 14 chars, should be number
         const result = safeJsonParse(input);
         // "1.23e+20".length is 8.
         expect(typeof result.val).toBe("number");
         expect(result.val).toBe(1.23e+20);
    });

    it('handles scientific notation long enough to trigger protection', () => {
        const input = '{"val": 1.23456789012345e+20}'; // > 14 chars
        const result = safeJsonParse(input);
        expect(result.val).toBe("1.23456789012345e+20");
    });

    it('handles whitespace', () => {
        const input = '{ "id" :  1234567890123456789 }';
        const result = safeJsonParse(input);
        expect(result.id).toBe("1234567890123456789");
    });

    it('handles null and empty string', () => {
        expect(safeJsonParse(null as any)).toBe(null);
        expect(safeJsonParse("")).toBe("");
    });

    // Boundary Tests
    it('handles boundary: 14 digits (safe integer) stays number', () => {
        const num = 12345678901234;
        const input = `{"id": ${num}}`;
        const result = safeJsonParse(input);
        expect(typeof result.id).toBe("number");
        expect(result.id).toBe(num);
    });

    it('handles boundary: 15 digits (safe integer but treated as string for safety) becomes string', () => {
        const numStr = "123456789012345";
        const input = `{"id": ${numStr}}`;
        const result = safeJsonParse(input);
        expect(typeof result.id).toBe("string");
        expect(result.id).toBe(numStr);
    });

    it('handles boundary: 16 digits (unsafe potential) becomes string', () => {
        const numStr = "1234567890123456";
        const input = `{"id": ${numStr}}`;
        const result = safeJsonParse(input);
        expect(typeof result.id).toBe("string");
        expect(result.id).toBe(numStr);
    });

    it('handles scientific notation: 1e+30 (short representation) stays number', () => {
        const input = '{"val": 1e+30}';
        const result = safeJsonParse(input);
        expect(typeof result.val).toBe("number");
        expect(result.val).toBe(1e+30);
    });
});
