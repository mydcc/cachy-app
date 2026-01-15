import { describe, it, expect } from "vitest";
import { parseLocalizedDecimal, escapeCSVValue } from "./csvService";
import { Decimal } from "decimal.js";

describe("csvService", () => {
  describe("parseLocalizedDecimal", () => {
    it("should parse German format with thousands dot and decimal comma", () => {
      const result = parseLocalizedDecimal("1.200,50");
      expect(result.toNumber()).toBe(1200.5);
    });

    it("should parse English format with thousands comma and decimal dot", () => {
      const result = parseLocalizedDecimal("1,200.50");
      expect(result.toNumber()).toBe(1200.5);
    });

    it("should parse simple German decimal", () => {
      const result = parseLocalizedDecimal("12,50");
      expect(result.toNumber()).toBe(12.5);
    });

    it("should parse simple English decimal", () => {
      const result = parseLocalizedDecimal("12.50");
      expect(result.toNumber()).toBe(12.5);
    });

    it("should parse ambiguous thousands (1,200) as English 1200", () => {
      const result = parseLocalizedDecimal("1,200");
      expect(result.toNumber()).toBe(1200);
    });

    it("should parse ambiguous (1.200) as standard float 1.2", () => {
      // Standard parseFloat treats 1.200 as 1.2.
      // Without context, we prefer safety of standard float.
      const result = parseLocalizedDecimal("1.200");
      expect(result.toNumber()).toBe(1.2);
    });

    it("should handle small German decimals like 1,5", () => {
      const result = parseLocalizedDecimal("1,5");
      expect(result.toNumber()).toBe(1.5);
    });
  });

  describe("escapeCSVValue", () => {
    it("should escape malicious formulas", () => {
      expect(escapeCSVValue("=1+1")).toBe("'=1+1");
      expect(escapeCSVValue("+1+1")).toBe("'+1+1");
      expect(escapeCSVValue("-1+1")).toBe("'-1+1");
      // Contains comma, so it gets quoted
      expect(escapeCSVValue("@SUM(1,1)")).toBe(`"'@SUM(1,1)"`);
    });

    it("should wrap in quotes if containing comma", () => {
      expect(escapeCSVValue("Hello, World")).toBe('"Hello, World"');
    });

    it("should escape existing quotes", () => {
      expect(escapeCSVValue('Hello "World"')).toBe('"Hello ""World"""');
    });
  });
});
