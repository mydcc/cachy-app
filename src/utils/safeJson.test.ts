import { describe, it, expect } from "vitest";
import { safeJsonParse } from "./safeJson";

describe("safeJsonParse", () => {
    it("parses normal JSON correctly", () => {
        const input = '{"a": 1, "b": "test"}';
        expect(safeJsonParse(input)).toEqual({ a: 1, b: "test" });
    });

    it("handles large integers by converting to string", () => {
        // Number > Number.MAX_SAFE_INTEGER (9007199254740991)
        const bigIntStr = "900719925474099999";
        const input = `{"id": ${bigIntStr}}`;
        const result = safeJsonParse(input);
        expect(result.id).toBe(bigIntStr);
        expect(typeof result.id).toBe("string");
    });

    it("handles large integers in arrays", () => {
        const bigIntStr = "1234567890123456789";
        const input = `[1, ${bigIntStr}, 3]`;
        const result = safeJsonParse(input);
        expect(result[1]).toBe(bigIntStr);
        expect(typeof result[1]).toBe("string");
    });

    it("handles high precision floats", () => {
        const floatStr = "0.1234567890123456789";
        const input = `{"val": ${floatStr}}`;
        const result = safeJsonParse(input);
        expect(result.val).toBe(floatStr);
    });

    it("preserves small numbers as numbers", () => {
        const input = '{"id": 12345}';
        const result = safeJsonParse(input);
        expect(result.id).toBe(12345);
        expect(typeof result.id).toBe("number");
    });

    it("handles Bitunix ticker format", () => {
        // Bitunix often sends numbers as strings, but sometimes as raw numbers
        // We simulate a raw number high precision scenario
        const input = '{"topic": "ticker", "data": {"vol": 123456789.123456789}}';
        const result = safeJsonParse(input);
        expect(result.data.vol).toBe("123456789.123456789");
    });

    it("handles nested structures", () => {
        const big = "123456789012345678";
        const input = `{"a": {"b": [${big}]}}`;
        const result = safeJsonParse(input);
        expect(result.a.b[0]).toBe(big);
    });

    it("handles negative numbers", () => {
         const big = "-123456789012345678";
         const input = `{"val": ${big}}`;
         const result = safeJsonParse(input);
         expect(result.val).toBe(big);
    });

    it("handles scientific notation", () => {
        const shortSci = "1.23e+5"; // Safe
        expect(safeJsonParse(`{"v": ${shortSci}}`).v).toBe(123000);

        // Long mantissa
        const longSci = "1.234567890123456789e+20";
        const result = safeJsonParse(`{"v": ${longSci}}`);
        expect(result.v).toBe(longSci);
    });
});
