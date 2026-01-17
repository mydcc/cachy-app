import { describe, it, expect } from "vitest";
import { parseDecimal } from "./utils";

describe("parseDecimal", () => {
  it("handles German thousand separators (1.000,00)", () => {
    const res = parseDecimal("1.000,00");
    expect(res.toString()).toBe("1000");
  });

  it("handles English thousand separators (1,000.00)", () => {
    const res = parseDecimal("1,000.00");
    expect(res.toString()).toBe("1000");
  });

  it("handles German decimals (1,5)", () => {
    const res = parseDecimal("1,5");
    expect(res.toString()).toBe("1.5");
  });

  it("handles English decimals (1.5)", () => {
    const res = parseDecimal("1.5");
    expect(res.toString()).toBe("1.5");
  });

  it("handles large English numbers (1,000,000)", () => {
    const res = parseDecimal("1,000,000");
    expect(res.toString()).toBe("1000000");
  });

  it("handles large German numbers (1.000.000,50)", () => {
    const res = parseDecimal("1.000.000,50");
    expect(res.toString()).toBe("1000000.5");
  });

  it("handles standard integers", () => {
    expect(parseDecimal("100").toString()).toBe("100");
  });

  it("handles empty/null", () => {
    expect(parseDecimal("").toString()).toBe("0");
    expect(parseDecimal(null).toString()).toBe("0");
  });
});
