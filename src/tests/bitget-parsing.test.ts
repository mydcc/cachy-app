
import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../utils/safeJson';

// Simulation of the "Fast Path" regex logic we want to implement
function fastPathPreProcess(rawData: string): string {
    if (rawData && (rawData.includes('"topic":"order"') || rawData.includes('"ch":"order"') ||
        rawData.includes('"topic":"position"') || rawData.includes('"ch":"position"') ||
        rawData.includes('"arg":') || rawData.includes('"data":'))) {

        // Regex to target specific keys followed by a number
        const regex = /"(orderId|id|planId|price|triggerPrice|qty|amount|size|margin|value|entryPrice|liquidationPrice|total|available|locked|equity|unrealizedPL|maxOpenPosCost|usdtVolume|volume24h|high24h|low24h|last|open24h)"\s*:\s*(-?\d+(\.\d+)?([eE][+-]?\d+)?)/g;
        return rawData.replace(regex, '"$1":"$2"');
    }
    return rawData;
}

describe('Bitget WebSocket Parsing Hardening', () => {
    // A large integer that exceeds MAX_SAFE_INTEGER (9007199254740991)
    // 9007199254740993 is 2 greater, so it would lose precision to ...992 or ...994
    const LARGE_ID = '9007199254740993';

    // A high precision float
    const HIGH_PRECISION = '0.0000000123456789123456789';

    it('demonstrates standard JSON.parse precision loss for large integers', () => {
        const jsonStr = `{"orderId": ${LARGE_ID}}`;
        const parsed = JSON.parse(jsonStr);
        // Expecting FAILURE of equality because JS numbers lose precision
        expect(String(parsed.orderId)).not.toBe(LARGE_ID);
    });

    it('demonstrates fast path regex preserves large integers', () => {
        const jsonStr = `{"arg":{"channel":"orders"},"data":[{"orderId": ${LARGE_ID}}]}`;
        const processed = fastPathPreProcess(jsonStr);
        const parsed = JSON.parse(processed);

        expect(parsed.data[0].orderId).toBe(LARGE_ID);
        expect(typeof parsed.data[0].orderId).toBe('string');
    });

    it('demonstrates fast path regex preserves high precision floats', () => {
        const jsonStr = `{"arg":{"channel":"ticker"},"data":[{"last": ${HIGH_PRECISION}}]}`;
        const processed = fastPathPreProcess(jsonStr);
        const parsed = JSON.parse(processed);

        expect(parsed.data[0].last).toBe(HIGH_PRECISION);
        expect(typeof parsed.data[0].last).toBe('string');
    });

    it('handles Bitget specific nested structure', () => {
        // Bitget format: { arg: { ... }, data: [ { ... } ] }
        const payload = `{"action":"snapshot","arg":{"instType":"mc","channel":"positions","instId":"BTCUSDT_UMCBL"},"data":[{"marginCoin":"USDT","locked":0,"available":1234.567890123456789,"total":1.23}]}`;

        const processed = fastPathPreProcess(payload);
        const parsed = JSON.parse(processed);

        // 'available' should be quoted string
        expect(parsed.data[0].available).toBe("1234.567890123456789");
        expect(typeof parsed.data[0].available).toBe('string');
    });

    it('handles whitespace around colon', () => {
        const jsonStr = `{"arg":{"channel":"orders"},"data":[{"orderId" : ${LARGE_ID}}]}`;
        const processed = fastPathPreProcess(jsonStr);
        const parsed = JSON.parse(processed);

        expect(parsed.data[0].orderId).toBe(LARGE_ID);
        expect(typeof parsed.data[0].orderId).toBe('string');
    });
});
