
import { describe, it, expect } from 'vitest';
import { preprocessBitunixMessage } from './bitunixWs';

describe('BitunixWS Hardening: preprocessBitunixMessage', () => {

    it('should quote numeric values for target keys', () => {
        const input = '{"topic":"price","data":{"p":123.456,"v":100}}';
        const expected = '{"topic":"price","data":{"p":"123.456","v":"100"}}';
        expect(preprocessBitunixMessage(input)).toBe(expected);
    });

    it('should quote large integers to prevent precision loss', () => {
        const input = '{"ch":"order","data":{"orderId":1234567890123456789}}';
        const expected = '{"ch":"order","data":{"orderId":"1234567890123456789"}}';
        expect(preprocessBitunixMessage(input)).toBe(expected);
    });

    it('should handle negative numbers and scientific notation', () => {
        const input = '{"topic":"trade","data":{"p":-100.5,"v":1.2e-5}}';
        const expected = '{"topic":"trade","data":{"p":"-100.5","v":"1.2e-5"}}';
        expect(preprocessBitunixMessage(input)).toBe(expected);
    });

    it('should NOT quote numbers if they are already quoted', () => {
        const input = '{"topic":"price","data":{"p":"123.45"}}';
        expect(preprocessBitunixMessage(input)).toBe(input);
    });

    it('should NOT corrupt string values that mimic JSON structure', () => {
        const input = '{"topic":"order","msg":"User set \\"price\\": 100"}';
        const processed = preprocessBitunixMessage(input);
        expect(processed).toBe(input);
    });
});
