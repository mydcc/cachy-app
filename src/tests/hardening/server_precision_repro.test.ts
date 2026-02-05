import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../utils/safeJson';

describe('Server-Side Precision Loss Reproduction', () => {
    // A typical Bitunix Order ID (19 digits)
    // 1234567890123456789
    // In IEEE 754 double precision (JavaScript number), this becomes:
    // 1234567890123456800 (Loss of precision)
    const largeIdStr = "1234567890123456789";
    const jsonPayload = `{"id": ${largeIdStr}, "status": "FILLED"}`;

    it('should demonstrate that native JSON.parse corrupts 19-digit integers', () => {
        const parsed = JSON.parse(jsonPayload);

        // Expect corruption
        expect(parsed.id.toString()).not.toBe(largeIdStr);
        expect(parsed.id).toBe(1234567890123456800);

        console.log(`[Repro] Native Parse: ${largeIdStr} -> ${parsed.id}`);
    });

    it('should demonstrate that safeJsonParse preserves 19-digit integers as strings', () => {
        const parsed = safeJsonParse(jsonPayload);

        // Expect preservation
        expect(parsed.id).toBe(largeIdStr);
        expect(typeof parsed.id).toBe('string');

        console.log(`[Repro] Safe Parse:   ${largeIdStr} -> ${parsed.id}`);
    });

    it('should handle array contexts correctly (Bitunix/Bitget lists)', () => {
        const listPayload = `{"data": [${largeIdStr}, 123]}`;
        const native = JSON.parse(listPayload);
        const safe = safeJsonParse(listPayload);

        expect(native.data[0].toString()).not.toBe(largeIdStr); // Corrupted
        expect(safe.data[0]).toBe(largeIdStr); // Preserved
    });
});
