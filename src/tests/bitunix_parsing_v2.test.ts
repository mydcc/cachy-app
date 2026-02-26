
import { describe, it, expect, vi } from 'vitest';

describe('BitunixWS Fast Path Regex (Updated)', () => {
    // The UPDATED regex from src/services/bitunixWs.ts (public socket)
    const applyRegexPublic = (input: string) => {
        const regex = /"(p|v|a|b|price|amount|qty|lastPrice|high|low|volume|quoteVolume|triggerPrice|stopPrice|i|m|c|o|h|l|orderId|id|planId)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
        return input.replace(regex, '"$1":"$2"');
    };

    // The UPDATED regex from src/services/bitunixWs.ts (private socket)
    const applyRegexPrivate = (input: string) => {
        const regex = /"(orderId|id|planId|price|triggerPrice|qty|amount|size|margin|value|entryPrice|liquidationPrice|averagePrice|avgOpenPrice|unrealizedPNL|realizedPNL|fee|dealAmount)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
        return input.replace(regex, '"$1":"$2"');
    };

    it('should quote scientific notation (public)', () => {
        const input = '{"topic":"price","data":{"price":1.23e-8}}';
        const expected = '{"topic":"price","data":{"price":"1.23e-8"}}';
        expect(applyRegexPublic(input)).toBe(expected);
    });

    it('should quote orderId (public)', () => {
        const input = '{"orderId":1234567890123456789}';
        const expected = '{"orderId":"1234567890123456789"}';
        expect(applyRegexPublic(input)).toBe(expected);
    });

    it('should quote fee and realizedPNL (private)', () => {
        const input = '{"fee":0.0001,"realizedPNL":-15.50}';
        const expected = '{"fee":"0.0001","realizedPNL":"-15.50"}';
        expect(applyRegexPrivate(input)).toBe(expected);
    });

    it('should handle large orderId in private message', () => {
         const input = '{"topic":"order","data":{"orderId":9876543210987654321}}';
         const expected = '{"topic":"order","data":{"orderId":"9876543210987654321"}}';
         expect(applyRegexPrivate(input)).toBe(expected);
    });
});
