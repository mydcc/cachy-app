import { describe, it, expect } from 'vitest';
import { parseDateString } from './utils';

describe('parseDateString', () => {
    it('should parse German date format DD.MM.YYYY', () => {
        const date = parseDateString('23.12.2025', '19:40:08');
        expect(date.toISOString()).toBe('2025-12-23T19:40:08.000Z');
    });

    it('should parse ISO date format YYYY-MM-DD', () => {
        const date = parseDateString('2025-12-23', '19:40:08');
        expect(date.toISOString()).toBe('2025-12-23T19:40:08.000Z');
    });

    it('should fallback to JS parsing for US format MM/DD/YYYY', () => {
        const date = parseDateString('12/23/2025', '19:40:08');
        expect(date.toISOString()).toBe('2025-12-23T19:40:08.000Z');
    });

    it('should handle empty time', () => {
        const date = parseDateString('23.12.2025', '');
        expect(date.toISOString()).toBe('2025-12-23T00:00:00.000Z');
    });
});

import { parseTimestamp } from './utils';

describe('parseTimestamp', () => {
    const NOW = Date.now();

    it('should parse valid millisecond timestamps (number)', () => {
        const ts = 1672531200000; // 2023-01-01
        expect(parseTimestamp(ts)).toBe(ts);
    });

    it('should parse valid millisecond timestamps (string)', () => {
        const ts = 1672531200000;
        expect(parseTimestamp(String(ts))).toBe(ts);
    });

    it('should convert seconds to milliseconds (number)', () => {
        const seconds = 1672531200;
        expect(parseTimestamp(seconds)).toBe(seconds * 1000);
    });

    it('should convert seconds to milliseconds (string)', () => {
        const seconds = 1672531200;
        expect(parseTimestamp(String(seconds))).toBe(seconds * 1000);
    });

    it('should handle floating point seconds (string)', () => {
        const seconds = 1672531200.5;
        expect(parseTimestamp(seconds)).toBe(1672531200500);
    });

    it('should return fallback for invalid inputs', () => {
        expect(parseTimestamp(undefined, 123)).toBe(123);
        expect(parseTimestamp(null, 123)).toBe(123);
        expect(parseTimestamp('', 123)).toBe(123);
        expect(parseTimestamp('invalid', 123)).toBe(123);
        expect(parseTimestamp(0, 123)).toBe(123);
        expect(parseTimestamp(-100, 123)).toBe(123);
    });

    it('should default fallback to Date.now()ish if not provided', () => {
        // Can't match exact now, but should be close
        const result = parseTimestamp(undefined);
        expect(result).toBeGreaterThan(NOW - 1000);
        expect(result).toBeLessThan(NOW + 1000);
    });
});
