// @vitest-environment node
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { parseDateString, parseTimestamp, escapeHtml, parseAiValue, parseDecimal, formatDynamicDecimal, unwrapApiEnvelope, deriveTickSizeFromPrice } from "./utils";

// Regression (BUG-0060): PositionsSidebar.svelte read `data.positions`/
// `data.error` straight off the response of /api/positions and /api/account,
// which actually respond via jsonSuccess/jsonError (src/utils/apiResponse.ts)
// wrapping the payload under `data.data` / `data.error.message`. Neither
// check ever matched, so a real position/account fetch silently populated
// nothing and surfaced no error — indistinguishable from a genuinely empty
// account. This is the real response body a user pasted while reporting it.
describe("unwrapApiEnvelope", () => {
  it("unwraps a real /api/positions success response", () => {
    const body = {
      success: true,
      data: {
        positions: [
          {
            positionId: "662491704776252252",
            symbol: "XRPUSDT",
            side: "LONG",
            size: "9.1",
            entryPrice: "1.0434",
            liquidationPrice: "0.9441",
            margin: "0.9540751212993",
            unrealizedPnL: "0.02639",
            marginRate: "0.0486",
            realizedPnl: "-0.0052172855007",
            leverage: "10",
            marginMode: "isolated",
          },
        ],
      },
    };
    const result = unwrapApiEnvelope<{ positions: unknown[] }>(body);
    expect(result.data?.positions).toHaveLength(1);
    expect(result.code).toBeUndefined();
  });

  it("unwraps an error response into { data: null, code, message }", () => {
    const body = {
      success: false,
      error: { code: "AUTH_ERROR", message: "Unauthorized" },
    };
    const result = unwrapApiEnvelope(body);
    expect(result.data).toBeNull();
    expect(result.code).toBe("AUTH_ERROR");
    expect(result.message).toBe("Unauthorized");
  });

  it("treats a missing success field as success with no data", () => {
    // A route that doesn't use this envelope at all (e.g. /api/orders)
    // should never be passed here — this documents the fallback behavior
    // rather than endorsing the call site.
    const result = unwrapApiEnvelope({});
    expect(result.data).toBeNull();
    expect(result.code).toBeUndefined();
  });
});

describe("parseTimestamp", () => {
  it("should return number as is (milliseconds)", () => {
    expect(parseTimestamp(1678888888000)).toBe(1678888888000);
  });

  it("should parse numeric string", () => {
    expect(parseTimestamp("1678888888000")).toBe(1678888888000);
  });

  it("should parse ISO date string", () => {
    const iso = "2025-12-23T10:00:00.000Z";
    const ts = new Date(iso).getTime();
    expect(parseTimestamp(iso)).toBe(ts);
  });

  it("should return 0 for invalid string", () => {
    expect(parseTimestamp("invalid")).toBe(0);
  });

  it("should return 0 for null", () => {
    expect(parseTimestamp(null)).toBe(0);
  });

  it("should return 0 for undefined", () => {
    expect(parseTimestamp(undefined)).toBe(0);
  });

  it("should return 0 for NaN", () => {
    expect(parseTimestamp(NaN)).toBe(0);
  });

  it("should return 0 for empty string", () => {
    expect(parseTimestamp("")).toBe(0);
  });

  it("should parse valid millisecond timestamps (number)", () => {
    const ts = 1672531200000; // 2023-01-01
    expect(parseTimestamp(ts)).toBe(ts);
  });

  it("should parse valid millisecond timestamps (string)", () => {
    const ts = 1672531200000;
    expect(parseTimestamp(String(ts))).toBe(ts);
  });

  it("should convert seconds to milliseconds (number)", () => {
    const seconds = 1672531200;
    expect(parseTimestamp(seconds)).toBe(seconds * 1000);
  });

  it("should convert seconds to milliseconds (string)", () => {
    const seconds = 1672531200;
    expect(parseTimestamp(String(seconds))).toBe(seconds * 1000);
  });

  it("should handle floating point seconds (string)", () => {
    const seconds = 1672531200.5;
    expect(parseTimestamp(seconds)).toBe(1672531200500);
  });

  it("should handle Date object", () => {
    const d = new Date();
    expect(parseTimestamp(d)).toBe(d.getTime());
  });
});

describe("parseDateString", () => {
  it("should parse German date format DD.MM.YYYY", () => {
    const date = parseDateString("23.12.2025", "19:40:08");
    expect(date.toISOString()).toBe("2025-12-23T19:40:08.000Z");
  });

  it("should parse ISO date format YYYY-MM-DD", () => {
    const date = parseDateString("2025-12-23", "19:40:08");
    expect(date.toISOString()).toBe("2025-12-23T19:40:08.000Z");
  });

  it("should fallback to JS parsing for US format MM/DD/YYYY", () => {
    const date = parseDateString("12/23/2025", "19:40:08");
    // Since our fallback now also tries to be UTC-friendly or we accept local
    // let's just ensure we test the behavior.
    // If I want UTC, I should ensure the fallback also handles it.
    expect(date.toISOString()).toContain("2025-12-23T");
  });

  it("should handle empty time", () => {
    const date = parseDateString("23.12.2025", "");
    expect(date.toISOString()).toBe("2025-12-23T00:00:00.000Z");
  });

  it("should respect useUtc=true (explicit)", () => {
    const date = parseDateString("23.12.2025", "10:00:00", true);
    expect(date.toISOString()).toBe("2025-12-23T10:00:00.000Z");
  });

  it("should respect useUtc=false (local time)", () => {
    const dateStr = "2025-12-23";
    const timeStr = "10:00:00";
    const date = parseDateString(dateStr, timeStr, false);

    // If local time, creating a new Date with same string but without Z should
    // match our instance if we don't force UTC.
    const localDate = new Date(`${dateStr}T${timeStr}`);
    expect(date.getTime()).toBe(localDate.getTime());
  });
});

describe("escapeHtml", () => {
  it("should escape special characters", () => {
    const input = '<script>alert("xss")&</script>';
    const expected = "&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;";
    expect(escapeHtml(input)).toBe(expected);
  });

  it("should handle null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("should handle normal strings", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("parseAiValue", () => {
  it("should handle normal integers", () => {
    expect(parseAiValue("100").toNumber()).toBe(100);
    expect(parseAiValue(100).toNumber()).toBe(100);
  });

  it("should handle English decimal format", () => {
    expect(parseAiValue("1,200.50").toNumber()).toBe(1200.5);
    expect(parseAiValue("1200.50").toNumber()).toBe(1200.5);
  });

  it("should handle German decimal format", () => {
    expect(parseAiValue("1.200,50").toNumber()).toBe(1200.5);
    expect(parseAiValue("50,5").toNumber()).toBe(50.5);
  });

  it("should handle k/m suffixes", () => {
    expect(parseAiValue("50k").toNumber()).toBe(50000);
    expect(parseAiValue("1.5m").toNumber()).toBe(1500000);
  });

  it("should handle large numbers", () => {
    expect(parseAiValue("1,000,000").toNumber()).toBe(1000000);
    expect(parseAiValue("1.000.000").toNumber()).toBe(1000000);
  });

  it("should handle booleans", () => {
    expect(parseAiValue(true).toNumber()).toBe(1);
    expect(parseAiValue(false).toNumber()).toBe(0);
  });

  it("should handle null/undefined/empty", () => {
    expect(parseAiValue(null as unknown as string).toNumber()).toBe(0);
    expect(parseAiValue(undefined as unknown as string).toNumber()).toBe(0);
    expect(parseAiValue("").toNumber()).toBe(0);
  });
});

describe("parseDecimal", () => {
  it("should return Decimal(0) for null/undefined", () => {
    expect(parseDecimal(null).toNumber()).toBe(0);
    expect(parseDecimal(undefined).toNumber()).toBe(0);
  });

  it("should parse valid numeric strings", () => {
    expect(parseDecimal("123.45").toNumber()).toBe(123.45);
    expect(parseDecimal("0").toNumber()).toBe(0);
    expect(parseDecimal("-10.5").toNumber()).toBe(-10.5);
  });

  it("should parse numbers", () => {
    expect(parseDecimal(100).toNumber()).toBe(100);
  });

  it("should handle English thousands separators", () => {
    // 1,234.56 -> 1234.56
    expect(parseDecimal("1,234.56").toNumber()).toBe(1234.56);
  });

  it("should handle German format", () => {
    // 1.234,56 -> 1234.56
    expect(parseDecimal("1.234,56").toNumber()).toBe(1234.56);
  });

  it("should handle invalid strings (like 'MARKET') by returning 0", () => {
    expect(parseDecimal("MARKET").toNumber()).toBe(0);
    expect(parseDecimal("LIMIT").toNumber()).toBe(0);
    expect(parseDecimal("abc").toNumber()).toBe(0);
  });
});

describe("formatDynamicDecimal", () => {
  it("should format valid numeric input", () => {
    expect(formatDynamicDecimal("123.4500")).toBe("123.45");
    expect(formatDynamicDecimal(100)).toBe("100");
  });

  it("should return '-' for null/undefined", () => {
    expect(formatDynamicDecimal(null)).toBe("-");
    expect(formatDynamicDecimal(undefined)).toBe("-");
  });

  it("should return '-' instead of throwing on a non-numeric string", () => {
    // Regression: `new Decimal("MARKET")` throws rather than yielding NaN,
    // and this is called from dozens of list/tooltip components with
    // whatever field an order/position object happens to hold.
    expect(formatDynamicDecimal("MARKET")).toBe("-");
    expect(formatDynamicDecimal("LIMIT")).toBe("-");
  });
});

describe("deriveTickSizeFromPrice", () => {
  it("derives the tick from the price's decimal places", () => {
    expect(deriveTickSizeFromPrice("0.00000912")?.eq("0.00000001")).toBe(true);
    expect(deriveTickSizeFromPrice("67123.5")?.eq("0.1")).toBe(true);
    expect(deriveTickSizeFromPrice(new Decimal(100))?.eq("1")).toBe(true);
    expect(deriveTickSizeFromPrice("1.0434")?.eq("0.0001")).toBe(true);
  });

  it("clamps extreme decimal places to the chart-renderable range", () => {
    expect(
      deriveTickSizeFromPrice("0.000000001234")?.eq("0.00000001"),
    ).toBe(true);
    // Trailing zeros do not count as precision
    expect(deriveTickSizeFromPrice("100.00000000")?.eq("1")).toBe(true);
  });

  it("treats zero as invalid (gt 0, not isPositive: Decimal#isPositive is true for 0)", () => {
    expect(deriveTickSizeFromPrice(0)).toBeNull();
  });

  it("returns null for invalid or non-positive input", () => {
    expect(deriveTickSizeFromPrice(undefined)).toBeNull();
    expect(deriveTickSizeFromPrice(null)).toBeNull();
    expect(deriveTickSizeFromPrice("MARKET")).toBeNull();
    expect(deriveTickSizeFromPrice(-5)).toBeNull();
  });
});
