import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../utils/safeJson';

describe('safeJsonParse', () => {
    it('should parse normal JSON correctly', () => {
        const json = '{"a": 1, "b": "test"}';
        const parsed = safeJsonParse(json);
        expect(parsed).toEqual({ a: 1, b: "test" });
    });

    it('should parse large integers ending in Id as strings', () => {
        const json = '{"orderId": 1234567890123456789}';
        const parsed = safeJsonParse(json);
        expect(parsed.orderId).toBe("1234567890123456789");
    });

    it('should parse large integers in arbitrary keys as strings (FIX REQUIRED)', () => {
        // This test is expected to fail with current implementation
        const bigIntStr = "1234567890123456789";
        const json = `{"timestamp": ${bigIntStr}, "nonce": ${bigIntStr}}`;

        const parsed = safeJsonParse(json);

        // Current implementation: timestamp is parsed as number and loses precision
        // Expected behavior after fix: timestamp is parsed as string
        expect(parsed.timestamp).toBe(bigIntStr);
        expect(parsed.nonce).toBe(bigIntStr);
        expect(typeof parsed.timestamp).toBe("string");
    });

    it('should not stringify small integers', () => {
        const json = '{"count": 123}';
        const parsed = safeJsonParse(json);
        expect(parsed.count).toBe(123);
        expect(typeof parsed.count).toBe("number");
    });

    it('should not double-quote already quoted strings', () => {
        const json = '{"id": "1234567890123456789"}';
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe("1234567890123456789");
    });

    it('should handle nested objects', () => {
        const bigIntStr = "9876543210987654321";
        const json = `{"data": {"value": ${bigIntStr}}}`;
        const parsed = safeJsonParse(json);
        expect(parsed.data.value).toBe(bigIntStr);
    });
});
