import { describe, it, expect } from 'vitest';

describe('Bitunix WebSocket JSON Parser Regex', () => {
    // The regex currently used in bitunixWs.ts (Improved version)
    // Note: This regex is for the price/ticker/trade path. The order/position path has a different key list but same logic.
    const regex = /(?<!\\)"(p|v|a|b|price|amount|qty|lastPrice|high|low|volume|quoteVolume|triggerPrice|stopPrice|i|m|c|o|h|l)"\s*:\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;

    const process = (json: string) => json.replace(regex, '"$1":"$2"');

    it('should quote standard integers', () => {
        const input = '{"price": 123}';
        const expected = '{"price":"123"}';
        expect(process(input)).toBe(expected);
    });

    it('should quote floats', () => {
        const input = '{"price": 123.45}';
        const expected = '{"price":"123.45"}';
        expect(process(input)).toBe(expected);
    });

    it('should quote scientific notation', () => {
        const input = '{"price": 1e-8}';
        const expected = '{"price":"1e-8"}';
        expect(process(input)).toBe(expected);
    });

    it('should quote uppercase scientific notation', () => {
        const input = '{"price": 1.5E+2}';
        const expected = '{"price":"1.5E+2"}';
        expect(process(input)).toBe(expected);
    });

    it('should quote negative numbers', () => {
        const input = '{"price": -123.45}';
        const expected = '{"price":"-123.45"}';
        expect(process(input)).toBe(expected);
    });

    it('should handle spaces', () => {
        const input = '{"price" :  123}';
        const expected = '{"price":"123"}';
        expect(process(input)).toBe(expected);
    });

    it('should handle large integers (precision check)', () => {
        const largeVol = '1234567890123456789.123';
        const inputVol = `{"volume": ${largeVol}}`;
        const expectedVol = `{"volume":"${largeVol}"}`;
        expect(process(inputVol)).toBe(expectedVol);
    });

    it('should NOT mess up keys inside strings', () => {
        const input = '{"msg": "The price is: 100"}';
        expect(process(input)).toBe(input);

        // Edge case: Escaped quotes
        const inputTricky = '{"msg": "Look at \\"price\\": 100"}';
        expect(process(inputTricky)).toBe(inputTricky);
    });
});
