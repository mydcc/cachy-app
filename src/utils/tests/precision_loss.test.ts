
import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../safeJson';

describe('Critical: JSON Precision Loss & Hardening', () => {
    // 1. Proof of Bug
    it('demonstrates that native JSON.parse destroys precision of 64-bit integers', () => {
        const rawId = "1234567890123456789";
        const jsonString = `{"orderId": ${rawId}}`;

        const parsed = JSON.parse(jsonString);
        expect(String(parsed.orderId)).not.toBe(rawId);
    });

    // 2. Verification of Fix
    it('verifies that safeJsonParse preserves large integers as strings', () => {
        const rawId = "1234567890123456789";
        const jsonString = `{"orderId": ${rawId}}`;

        const parsed = safeJsonParse(jsonString);

        console.log(`[Safe Parse] Raw ID:    ${rawId}`);
        console.log(`[Safe Parse] Parsed ID: ${parsed.orderId} (Type: ${typeof parsed.orderId})`);

        expect(parsed.orderId).toBe(rawId);
        expect(typeof parsed.orderId).toBe('string');
    });

    // 3. Regression Check for other types
    it('verifies that safeJsonParse handles normal data correctly', () => {
        const json = `{"id": 123, "name": "test", "val": 10.5}`;
        const parsed = safeJsonParse(json);
        expect(parsed.id).toBe(123); // Small int remains number (if < 15 digits)
        expect(parsed.name).toBe("test");
        expect(parsed.val).toBe(10.5);
    });
});
