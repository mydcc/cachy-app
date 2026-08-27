import { describe, expect, it } from "vitest";
import {
    buildAxisFormatters,
    formatCountdown,
    formatUtcIntradayTime,
    mapPriceScaleMode,
    nextCandleCloseTime,
    parseTimeframe,
    resolveChartPriceDecimals,
    timeframeDurationMs,
} from "./chartDisplay";

describe("formatUtcIntradayTime", () => {
    const MS = Date.UTC(2024, 0, 15, 10, 5, 9); // 2024-01-15T10:05:09Z

    it("formats HH:MM without seconds", () => {
        expect(formatUtcIntradayTime(MS, false)).toBe("10:05");
    });

    it("formats HH:MM:SS with seconds", () => {
        expect(formatUtcIntradayTime(MS, true)).toBe("10:05:09");
    });

    it("pads single digits", () => {
        expect(formatUtcIntradayTime(Date.UTC(2024, 0, 1, 3, 7, 0), true)).toBe(
            "03:07:00",
        );
    });
});

describe("buildAxisFormatters", () => {
    // TickMarkType: Year=0, Month=1, Day=2, Time=3, TimeWithSeconds=4
    it("returns null for date-ish ticks so native labels stay intact", () => {
        const f = buildAxisFormatters(true).tickMarkFormatter;
        expect(f(Date.UTC(2024, 0, 1) / 1000, 0)).toBeNull(); // Year
        expect(f(Date.UTC(2024, 0, 1) / 1000, 2)).toBeNull(); // Day
    });

    it("appends seconds on time ticks when enabled", () => {
        const f = buildAxisFormatters(true).tickMarkFormatter;
        const t = Date.UTC(2024, 0, 15, 10, 5, 9) / 1000;
        expect(f(t, 3)).toBe("10:05:09");
        expect(f(t, 4)).toBe("10:05:09");
    });

    it("returns null for everything when seconds are disabled", () => {
        const { tickMarkFormatter } = buildAxisFormatters(false);
        const t = Date.UTC(2024, 0, 15, 10, 5, 9) / 1000;
        expect(tickMarkFormatter(t, 3)).toBeNull();
        expect(tickMarkFormatter(t, 4)).toBeNull();
    });

    it("timeFormatter mirrors the toggle and keeps non-numeric input", () => {
        const on = buildAxisFormatters(true);
        const off = buildAxisFormatters(false);
        const t = Date.UTC(2024, 0, 15, 10, 5, 9) / 1000;

        expect(on.timeFormatter(t)).toBe("10:05:09");
        expect(off.timeFormatter(t)).toBe("10:05");
        expect(on.timeFormatter("2024-01-15")).toBe("2024-01-15");
    });
});

describe("mapPriceScaleMode", () => {
    it("maps linear to Normal (0)", () => {
        expect(mapPriceScaleMode("linear")).toBe(0);
    });

    it("maps log to Logarithmic (1) - the long-standing default", () => {
        expect(mapPriceScaleMode("log")).toBe(1);
    });

    it("never yields the removed rebasing modes", () => {
        // Percentage = 2 / IndexedTo100 = 3 were removed from settings on
        // purpose; the mapper's return type makes them unreachable, but this
        // assertion documents the contract for future readers.
        const allowed = new Set([0, 1]);
        expect(allowed.has(mapPriceScaleMode("linear"))).toBe(true);
        expect(allowed.has(mapPriceScaleMode("log"))).toBe(true);
    });
});

describe("parseTimeframe", () => {
    it("parses every unit used by ALL_TIMEFRAMES", () => {
        expect(parseTimeframe("5m")).toEqual({ value: 5, unit: "m" });
        expect(parseTimeframe("1h")).toEqual({ value: 1, unit: "h" });
        expect(parseTimeframe("3d")).toEqual({ value: 3, unit: "d" });
        expect(parseTimeframe("1w")).toEqual({ value: 1, unit: "w" });
        expect(parseTimeframe("1M")).toEqual({ value: 1, unit: "M" });
        expect(parseTimeframe("45m")).toEqual({ value: 45, unit: "m" });
    });

    it("rejects malformed timeframes", () => {
        expect(parseTimeframe("")).toBeNull();
        expect(parseTimeframe("5x")).toBeNull();
        expect(parseTimeframe("m")).toBeNull();
        expect(parseTimeframe("-5m")).toBeNull();
        expect(parseTimeframe("0m")).toBeNull();
        expect(parseTimeframe("5 m")).toBeNull();
    });
});

describe("timeframeDurationMs", () => {
    it("returns fixed durations", () => {
        expect(timeframeDurationMs("1m")).toBe(60_000);
        expect(timeframeDurationMs("5m")).toBe(300_000);
        expect(timeframeDurationMs("1h")).toBe(3_600_000);
        expect(timeframeDurationMs("4h")).toBe(4 * 3_600_000);
        expect(timeframeDurationMs("1d")).toBe(86_400_000);
        expect(timeframeDurationMs("1w")).toBe(7 * 86_400_000);
    });

    it("returns null for calendar months and invalid input", () => {
        expect(timeframeDurationMs("1M")).toBeNull();
        expect(timeframeDurationMs("nope")).toBeNull();
    });
});

describe("nextCandleCloseTime", () => {
    it("adds the fixed duration to the open time", () => {
        const open = 1_700_000_000_000;
        expect(nextCandleCloseTime(open, "5m")).toBe(open + 300_000);
        expect(nextCandleCloseTime(open, "1h")).toBe(open + 3_600_000);
        expect(nextCandleCloseTime(open, "1w")).toBe(open + 7 * 86_400_000);
    });

    it("handles calendar months on UTC month boundaries", () => {
        // Feb 1 2024 00:00 UTC -> Mar 1 2024 00:00 UTC (leap year)
        const febFirst = Date.UTC(2024, 1, 1);
        expect(nextCandleCloseTime(febFirst, "1M")).toBe(Date.UTC(2024, 2, 1));

        // Dec 1 2023 -> Jan 1 2024 (year rollover)
        const decFirst = Date.UTC(2023, 11, 1);
        expect(nextCandleCloseTime(decFirst, "1M")).toBe(Date.UTC(2024, 0, 1));

        // Mid-month opens roll by month length from the same day-of-month
        const jan15 = Date.UTC(2024, 0, 15);
        expect(nextCandleCloseTime(jan15, "1M")).toBe(Date.UTC(2024, 1, 15));
    });

    it("rejects non-positive or invalid open times", () => {
        expect(nextCandleCloseTime(0, "5m")).toBeNull();
        expect(nextCandleCloseTime(-1, "5m")).toBeNull();
        expect(nextCandleCloseTime(Number.NaN, "5m")).toBeNull();
        expect(nextCandleCloseTime(1_700_000_000_000, "bad")).toBeNull();
    });
});

describe("formatCountdown", () => {
    it("formats minutes:seconds under an hour", () => {
        expect(formatCountdown(0)).toBe("00:00");
        expect(formatCountdown(1_000)).toBe("00:01");
        expect(formatCountdown(59_999)).toBe("00:59");
    });

    it("escalates to hours", () => {
        expect(formatCountdown(3_661_000)).toBe("01:01:01");
    });

    it("escalates to days for long timeframes", () => {
        expect(formatCountdown(90_061_000)).toBe("1d 01:01:01");
    });

    it("clamps negative input to zero", () => {
        expect(formatCountdown(-5_000)).toBe("00:00");
    });
});

describe("resolveChartPriceDecimals", () => {
    it("auto mode follows quotePrecision", () => {
        expect(resolveChartPriceDecimals("auto", 2, 1)).toBe(1);
        expect(resolveChartPriceDecimals("auto", 2, 8)).toBe(8);
    });

    it("auto mode falls back to 2 without metadata", () => {
        expect(resolveChartPriceDecimals("auto", 2, undefined)).toBe(2);
    });

    it("auto mode clamps extreme precision values", () => {
        expect(resolveChartPriceDecimals("auto", 2, 20)).toBe(8);
    });

    it("fixed mode uses the user value within bounds", () => {
        expect(resolveChartPriceDecimals("fixed", 4, 8)).toBe(4);
    });

    it("fixed mode clamps out-of-range user values", () => {
        expect(resolveChartPriceDecimals("fixed", -1, undefined)).toBe(0);
        expect(resolveChartPriceDecimals("fixed", 12, undefined)).toBe(8);
        expect(resolveChartPriceDecimals("fixed", Number.NaN, undefined)).toBe(
            2,
        );
    });
});
