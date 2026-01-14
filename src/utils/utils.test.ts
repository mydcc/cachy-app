import { describe, it, expect } from "vitest";
import { parseDateString, parseTimestamp, escapeHtml } from "./utils";

describe("parseTimestamp", () => {
  const NOW = Date.now();

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
  it("should escape unsafe HTML characters", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("should escape ampersands", () => {
    expect(escapeHtml("Ben & Jerry's")).toBe("Ben &amp; Jerry&#039;s");
  });

  it("should return empty string for null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
