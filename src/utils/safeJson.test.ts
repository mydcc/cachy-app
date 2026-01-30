import { describe, it, expect } from 'vitest';
import { safeJsonParse } from './safeJson';

describe('Data Integrity: safeJsonParse', () => {
    it('parses normal JSON correctly', () => {
        const json = '{"key": "value", "num": 123}';
        const result = safeJsonParse(json);
        expect(result).toEqual({ key: "value", num: 123 });
    });

    it('protects standard large integers (orderId)', () => {
        const largeInt = "1234567890123456789";
        const json = `{"orderId": ${largeInt}}`;
        const result = safeJsonParse(json);
        expect(result.orderId).toBe(largeInt);
        expect(typeof result.orderId).toBe("string");
    });

    it('protects generic Id fields (positionId)', () => {
        const largeInt = "9876543210987654321";
        const json = `{"positionId": ${largeInt}}`;
        const result = safeJsonParse(json);
        expect(result.positionId).toBe(largeInt);
        expect(typeof result.positionId).toBe("string");
    });

    it('protects mixed case fields (AlgoID)', () => {
        const largeInt = "1112223334445556667";
        const json = `{"AlgoID": ${largeInt}}`;
        const result = safeJsonParse(json);
        expect(result.AlgoID).toBe(largeInt);
        expect(typeof result.AlgoID).toBe("string");
    });

    it('does not corrupt small numbers', () => {
        const json = '{"id": 123}';
        const result = safeJsonParse(json);
        expect(result.id).toBe(123);
        expect(typeof result.id).toBe("number");
    });

    it('does NOT quote floats ending in Id (e.g. bid)', () => {
        // "bid": 123456789012345.5 should NOT become "bid": "123456789012345".5
        const largeFloat = "123456789012345.5";
        const json = `{"bid": ${largeFloat}}`;
        const result = safeJsonParse(json);
        // It should remain a number (standard JS precision applies)
        expect(result.bid).toBe(123456789012345.5);
        expect(typeof result.bid).toBe("number");
    });

    it('does NOT quote floats in general', () => {
        const json = '{"price": 12345.6789}';
        const result = safeJsonParse(json);
        expect(result.price).toBe(12345.6789);
        expect(typeof result.price).toBe("number");
    });
});
