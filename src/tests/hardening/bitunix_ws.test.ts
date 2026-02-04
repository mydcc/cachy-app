
import { describe, it, expect } from "vitest";
import { isPriceData, isTickerData, isDepthData } from "../../services/bitunixWs";

describe("Bitunix WebSocket Fast Path Guards", () => {
    describe("isPriceData", () => {
        it("should accept valid price data", () => {
            expect(isPriceData({ lastPrice: 100 })).toBe(true);
            expect(isPriceData({ lastPrice: "100" })).toBe(true);
            expect(isPriceData({ lp: 100 })).toBe(true);
            expect(isPriceData({ ip: "50" })).toBe(true);
        });

        it("should reject null or undefined", () => {
            expect(isPriceData(null)).toBe(false);
            expect(isPriceData(undefined)).toBe(false);
        });

        it("should reject malicious payloads", () => {
            // Current implementation allows objects!
            // We expect these to fail AFTER hardening.
            // For now, let's document what we WANT.

            // lastPrice is an object?
            expect(isPriceData({ lastPrice: {} })).toBe(false);

            // lastPrice is null?
            expect(isPriceData({ lastPrice: null })).toBe(false);

            // lastPrice is array?
            expect(isPriceData({ lastPrice: [] })).toBe(false);

            // Mixed valid/invalid: Valid funding rate but invalid price
            expect(isPriceData({ lastPrice: {}, fr: "0.01" })).toBe(false);
        });
    });

    describe("isTickerData", () => {
        it("should accept valid ticker data", () => {
            expect(isTickerData({ lastPrice: 100, volume: 50 })).toBe(true);
            expect(isTickerData({ v: "50", close: "100" })).toBe(true);
        });

        it("should reject invalid types", () => {
            expect(isTickerData({ lastPrice: {} })).toBe(false);
            expect(isTickerData({ volume: [] })).toBe(false);
        });
    });

    describe("isDepthData", () => {
        it("should accept valid depth data", () => {
            expect(isDepthData({ b: [], a: [] })).toBe(true);
            expect(isDepthData({ b: [[1, 1]], a: [[2, 2]] })).toBe(true);
        });

        it("should reject invalid depth data", () => {
            expect(isDepthData({})).toBe(false);
            expect(isDepthData({ b: null, a: [] })).toBe(false);
            expect(isDepthData({ b: [], a: {} })).toBe(false);
        });
    });
});
