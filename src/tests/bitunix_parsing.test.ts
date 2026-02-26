
import { describe, it, expect, vi } from 'vitest';
import { safeJsonParse } from '../utils/safeJson';

// Mock dependencies
const marketState = {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    connectionStatus: 'connected',
    updateTelemetry: vi.fn(),
};

const accountState = {
    updatePositionFromWs: vi.fn(),
    updateOrderFromWs: vi.fn(),
    updateBalanceFromWs: vi.fn(),
};

const omsService = {
    updatePosition: vi.fn(),
    updateOrder: vi.fn(),
};

const logger = {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
};

// We need to test the logic that is inside BitunixWebSocketService.
// Since it's a class with private methods, we might need to expose the regex logic or test it via a helper.
// However, the critical logic is in the `onmessage` handler where it replaces regex.
// Let's copy the regex logic here to test it in isolation first, then we can try to test the class if possible.

describe('BitunixWS Fast Path Regex', () => {
    // The regex from src/services/bitunixWs.ts
    // const regex = /"(p|v|a|b|price|amount|qty|lastPrice|high|low|volume|quoteVolume|triggerPrice|stopPrice|i|m|c|o|h|l)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;

    const applyRegex = (input: string) => {
        const regex = /"(p|v|a|b|price|amount|qty|lastPrice|high|low|volume|quoteVolume|triggerPrice|stopPrice|i|m|c|o|h|l)":\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
        return input.replace(regex, '"$1":"$2"');
    };

    it('should quote normal integer numbers', () => {
        const input = '{"topic":"price","data":{"price":12345}}';
        const expected = '{"topic":"price","data":{"price":"12345"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote decimal numbers', () => {
        const input = '{"topic":"price","data":{"price":123.45}}';
        const expected = '{"topic":"price","data":{"price":"123.45"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote negative numbers', () => {
        const input = '{"topic":"price","data":{"price":-123.45}}';
        const expected = '{"topic":"price","data":{"price":"-123.45"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote scientific notation (standard)', () => {
        const input = '{"topic":"price","data":{"price":1.23e-8}}';
        const expected = '{"topic":"price","data":{"price":"1.23e-8"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote scientific notation (uppercase E)', () => {
        const input = '{"topic":"price","data":{"price":1.23E+8}}';
        const expected = '{"topic":"price","data":{"price":"1.23E+8"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote zero', () => {
        const input = '{"topic":"price","data":{"price":0}}';
        const expected = '{"topic":"price","data":{"price":"0"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should quote zero point zero', () => {
        const input = '{"topic":"price","data":{"price":0.0}}';
        const expected = '{"topic":"price","data":{"price":"0.0"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should handle multiple fields', () => {
        const input = '{"data":{"price":100,"qty":0.5}}';
        // Note: JSON serialization order isn't guaranteed but regex replace is sequential string processing
        const expected = '{"data":{"price":"100","qty":"0.5"}}';
        expect(applyRegex(input)).toBe(expected);
    });

    it('should NOT quote already quoted strings', () => {
        // The regex expects : followed by number/whitespace.
        // If it's :"123", the quote is captured?
        // Wait, \s* match optional whitespace.
        // If input is "price":"123", the regex checks for "price": followed by a number.
        // "123" starts with ". If the digit part matches...
        // The regex is (-?\d+...). " is not a digit.
        // So it should fail to match "123" as a number.

        const input = '{"price":"123.45"}';
        expect(applyRegex(input)).toBe(input);
    });

    it('should handle large integers (orderId like)', () => {
        // Bitunix orderId often comes as number in some messages, we want to quote it if we add 'orderId' to the regex key list.
        // But the current regex list is: (p|v|a|b|price|amount|qty|lastPrice|high|low|volume|quoteVolume|triggerPrice|stopPrice|i|m|c|o|h|l)
        // 'orderId' is NOT in the list yet.
        // Let's verify it DOES NOT quote orderId currently.
        const input = '{"orderId":1234567890123456789}';
        expect(applyRegex(input)).toBe(input);
    });
});
