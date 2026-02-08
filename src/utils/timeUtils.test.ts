import { describe, it, expect } from 'vitest';
import { safeTfToMs } from './timeUtils';

describe('safeTfToMs', () => {
    it('should parse valid timeframes correctly', () => {
        expect(safeTfToMs('1m')).toBe(60000);
        expect(safeTfToMs('5m')).toBe(300000);
        expect(safeTfToMs('1h')).toBe(3600000);
        expect(safeTfToMs('4h')).toBe(14400000);
        expect(safeTfToMs('1d')).toBe(86400000);
        expect(safeTfToMs('1w')).toBe(604800000);
    });

    it('should return default for invalid formats', () => {
        expect(safeTfToMs('')).toBe(60000);
        expect(safeTfToMs('invalid')).toBe(60000);
        expect(safeTfToMs('1x')).toBe(60000); // Invalid unit
        expect(safeTfToMs('-1m')).toBe(60000); // Negative not matched by regex
    });

    it('should return default for non-string inputs', () => {
        expect(safeTfToMs(null as any)).toBe(60000);
        expect(safeTfToMs(undefined as any)).toBe(60000);
    });
});
