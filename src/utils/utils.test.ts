import { describe, it, expect } from 'vitest';
import { parseDateString, parseTimestamp } from './utils';

describe('parseTimestamp', () => {
    const NOW = Date.now();

    it('should return number as is (milliseconds)', () => {
        expect(parseTimestamp(1678888888000)).toBe(1678888888000);
    });

    it('should parse numeric string', () => {
        expect(parseTimestamp("1678888888000")).toBe(1678888888000);
    });

    it('should parse ISO date string', () => {
        const iso = "2025-12-23T10:00:00.000Z";
        const ts = new Date(iso).getTime();
        expect(parseTimestamp(iso)).toBe(ts);
    });

    it('should return 0 for invalid string', () => {
        expect(parseTimestamp("invalid")).toBe(0);
    });

    it('should return 0 for null', () => {
        expect(parseTimestamp(null)).toBe(0);
    });

    it('should return 0 for undefined', () => {
        expect(parseTimestamp(undefined)).toBe(0);
    });

    it('should return 0 for NaN', () => {
        expect(parseTimestamp(NaN)).toBe(0);
    });

    it('should return 0 for empty string', () => {
        expect(parseTimestamp("")).toBe(0);
    });

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

    it('should handle Date object', () => {
        const d = new Date();
        expect(parseTimestamp(d)).toBe(d.getTime());
    });
});

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
