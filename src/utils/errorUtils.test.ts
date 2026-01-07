
import { describe, it, expect } from 'vitest';
import { getBitunixErrorKey } from './errorUtils';

describe('errorUtils', () => {
    it('should return the correct key for a known error code', () => {
        expect(getBitunixErrorKey(10001)).toBe('bitunixErrors.10001');
        expect(getBitunixErrorKey('10003')).toBe('bitunixErrors.10003');
        expect(getBitunixErrorKey(30042)).toBe('bitunixErrors.30042');
    });

    it('should return generic error key for unknown error code', () => {
        expect(getBitunixErrorKey(99999)).toBe('apiErrors.generic');
        expect(getBitunixErrorKey('invalid_code')).toBe('apiErrors.generic');
    });

    it('should handle number and string inputs correctly', () => {
        expect(getBitunixErrorKey(20001)).toBe('bitunixErrors.20001');
        expect(getBitunixErrorKey('20001')).toBe('bitunixErrors.20001');
    });
});
