import { describe, it, expect } from "vitest";
import { isPriceData, isTickerData, isTradeData, isDepthData } from "./bitunixWs";

describe("Bitunix WebSocket Fast Path Guards", () => {
    describe("isPriceData", () => {
        it("should accept valid price data", () => {
            expect(isPriceData({ lastPrice: "50000" })).toBe(true);
            expect(isPriceData({ lp: 50000 })).toBe(true);
            expect(isPriceData({ ip: "50000" })).toBe(true);
            expect(isPriceData({ fr: "0.0001" })).toBe(true);
            expect(isPriceData({ lastPrice: "50000", fr: "0.0001" })).toBe(true);
        });

        it("should reject null or non-objects", () => {
            expect(isPriceData(null)).toBe(false);
            expect(isPriceData(undefined)).toBe(false);
            expect(isPriceData("string")).toBe(false);
            expect(isPriceData(123)).toBe(false);
            expect(isPriceData([])).toBe(false);
        });

        it("should reject objects with unsafe types for critical fields", () => {
            expect(isPriceData({ lastPrice: {} })).toBe(false);
            expect(isPriceData({ lastPrice: null })).toBe(false);
            expect(isPriceData({ lastPrice: [] })).toBe(false);
            expect(isPriceData({ fr: { val: 1 } })).toBe(false);
        });

        it("should reject objects without any known fields", () => {
            expect(isPriceData({ someOtherField: "value" })).toBe(false);
            expect(isPriceData({})).toBe(false);
        });
    });

    describe("isTickerData", () => {
        it("should accept valid ticker data", () => {
            expect(isTickerData({ lastPrice: "50000", volume: "100" })).toBe(true);
            expect(isTickerData({ close: 50000 })).toBe(true);
            expect(isTickerData({ v: "100" })).toBe(true);
        });

        it("should reject unsafe types", () => {
            expect(isTickerData({ lastPrice: null })).toBe(false);
            expect(isTickerData({ volume: {} })).toBe(false);
        });

        it("should reject objects without known fields", () => {
            expect(isTickerData({ random: "field" })).toBe(false);
        });
    });

    describe("isTradeData", () => {
        it("should accept valid trade data", () => {
            expect(isTradeData({ p: "50000", v: "0.1" })).toBe(true);
            expect(isTradeData({ lastPrice: 50000, volume: 0.1 })).toBe(true);
            expect(isTradeData({ price: "50000", amount: "0.1" })).toBe(true);
        });

        it("should reject missing price or volume", () => {
            expect(isTradeData({ p: "50000" })).toBe(false); // Missing v
            expect(isTradeData({ v: "0.1" })).toBe(false);   // Missing p
        });

        it("should reject unsafe types", () => {
            expect(isTradeData({ p: {}, v: "0.1" })).toBe(false);
            expect(isTradeData({ p: "50000", v: null })).toBe(false);
        });
    });

    describe("isDepthData", () => {
        it("should accept valid depth data", () => {
            expect(isDepthData({ b: [], a: [] })).toBe(true);
            expect(isDepthData({ b: [["1", "1"]], a: [["2", "2"]] })).toBe(true);
        });

        it("should reject malformed depth data", () => {
            expect(isDepthData({ b: [] })).toBe(false); // Missing a
            expect(isDepthData({ a: [] })).toBe(false); // Missing b
            expect(isDepthData({ b: "bad", a: [] })).toBe(false);
            expect(isDepthData({})).toBe(false);
        });
    });
});
