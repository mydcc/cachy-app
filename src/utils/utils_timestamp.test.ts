import { parseTimestamp } from './utils';
import { describe, it, expect } from 'vitest';

describe('parseTimestamp', () => {
    it('handles null and undefined', () => {
        expect(parseTimestamp(null)).toBe(0);
        expect(parseTimestamp(undefined)).toBe(0);
    });

    it('handles numeric milliseconds', () => {
        const now = 1700000000000; // 2023-ish in ms
        expect(parseTimestamp(now)).toBe(now);
    });

    it('handles numeric seconds', () => {
        const nowSec = 1700000000; // 2023-ish in seconds
        expect(parseTimestamp(nowSec)).toBe(nowSec * 1000);
    });

    it('handles string milliseconds', () => {
        const nowStr = "1700000000000";
        expect(parseTimestamp(nowStr)).toBe(1700000000000);
    });

    it('handles string seconds', () => {
        const nowSecStr = "1700000000";
        expect(parseTimestamp(nowSecStr)).toBe(1700000000 * 1000);
    });

    it('handles ISO date strings', () => {
        const iso = "2023-11-14T22:13:20.000Z";
        const expected = new Date(iso).getTime();
        expect(parseTimestamp(iso)).toBe(expected);
    });

    it('handles short ISO date strings', () => {
        const iso = "2023-01-01";
        const expected = new Date(iso).getTime(); // UTC midnight
        expect(parseTimestamp(iso)).toBe(expected);
    });

    it('handles invalid strings', () => {
        expect(parseTimestamp("invalid")).toBe(0);
        expect(parseTimestamp("")).toBe(0);
    });

    it('differentiates numeric-looking strings from dates', () => {
        // "2023" as a string could be a year or a timestamp
        // parseTimestamp treats numeric string as timestamp number
        // 2023 < 10 billion -> seconds -> 2023000 ms (1970)
        expect(parseTimestamp("2023")).toBe(2023 * 1000);
    });

    it('handles float strings', () => {
        // "1700000000.5" seconds
        expect(parseTimestamp("1700000000.5")).toBe(1700000000500);
    });
});
