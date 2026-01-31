
import { describe, it, expect } from "vitest";
import { safeJsonParse } from "../utils/safeJson";

describe("Precision Loss Reproduction", () => {
  it("should lose precision with standard JSON.parse for large integers", () => {
    const json = '{"orderId": 1234567890123456789}';
    const parsed = JSON.parse(json);
    // JS max safe integer is 9007199254740991
    // 1234567890123456789 is much larger
    // Comparison against string to avoid JS parser rounding the expected value too
    expect(String(parsed.orderId)).not.toBe("1234567890123456789");
  });

  it("should preserve precision with safeJsonParse", () => {
    const json = '{"orderId": 1234567890123456789}';
    const parsed = safeJsonParse(json);
    expect(parsed.orderId).toBe("1234567890123456789");
  });
});
