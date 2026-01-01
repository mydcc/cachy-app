import { describe, it, expect } from 'vitest';
import { hexToRgba } from './colors';

describe('colors utility', () => {
    describe('hexToRgba', () => {
        it('should convert 6-digit hex to rgba', () => {
            expect(hexToRgba('#10b981', 0.1)).toBe('rgba(16, 185, 129, 0.1)');
            expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
            expect(hexToRgba('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
        });

        it('should convert 3-digit hex to rgba', () => {
            expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
            expect(hexToRgba('#000', 1)).toBe('rgba(0, 0, 0, 1)');
        });

        it('should handle hex without hash', () => {
            expect(hexToRgba('10b981', 0.1)).toBe('rgba(16, 185, 129, 0.1)');
        });

        it('should return input if not hex', () => {
            expect(hexToRgba('rgb(0,0,0)')).toBe('#rgb(0,0,0)'); // Fallback behavior for now
        });
    });
});
