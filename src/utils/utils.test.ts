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
