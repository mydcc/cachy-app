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

/**
 * FEAT-0233: the dashboard must never fabricate a signal.
 *
 * Before this, unanalysed symbols were handed a placeholder
 * `confluenceScore: 0`. Zero is the BOTTOM of the confluence scale -- "Strong
 * Sell" -- so a symbol nobody had looked at rendered as the strongest sell
 * signal on the board, in an app whose next screen sizes a real position.
 * These tests exist to keep "no data" and "sell" apart.
 */

import { describe, it, expect } from "vitest";
import {
    buildRows,
    marketHeat,
    marketBreadth,
    topOpportunity,
    signalFor,
    trendCellClass,
    analysisScope,
    TOP_FAVOURITES_COUNT,
} from "./marketDashboard";
import type { SymbolAnalysis } from "../stores/analysis.svelte";

function analysis(over: Partial<SymbolAnalysis> & { symbol: string }): SymbolAnalysis {
    return {
        updatedAt: 1,
        price: "100",
        change24h: "0",
        trend4h: "bullish",
        trends: { "15m": "bullish", "1h": "bullish", "4h": "bullish", "1d": "bullish" },
        rsi1h: "50",
        confluenceScore: 50,
        condition: "neutral",
        quality: "complete",
        ...over,
    };
}

describe("analysisScope", () => {
    const six = ["A", "B", "C", "D", "E", "F"];

    it("limits to the top favourites when analyzeAll is off", () => {
        expect(analysisScope(six, false)).toHaveLength(TOP_FAVOURITES_COUNT);
    });

    it("covers every favourite when analyzeAll is on", () => {
        expect(analysisScope(six, true)).toEqual(six);
    });
});

describe("buildRows", () => {
    it("never gives an unanalysed symbol a score", () => {
        const [row] = buildRows(["XRPUSDT"], {}, true);

        expect(row.analysed).toBe(false);
        expect(row.analysis).toBeUndefined();
        // The regression that matters: no fabricated 0, which reads as
        // "Strong Sell" on this scale.
        expect(signalFor(row.analysis).tone).not.toBe("bearish");
    });

    it("sorts unanalysed symbols below analysed ones regardless of score", () => {
        const rows = buildRows(
            ["XRPUSDT", "SOLUSDT"],
            { SOLUSDT: analysis({ symbol: "SOLUSDT", confluenceScore: 12 }) },
            true,
        );

        // Even a low-scoring analysed row outranks an unknown one: 12 is a
        // measurement, absence is not.
        expect(rows.map((r) => r.symbol)).toEqual(["SOLUSDT", "XRPUSDT"]);
    });

    it("sorts analysed rows by score, highest first", () => {
        const rows = buildRows(
            ["A", "B", "C"],
            {
                A: analysis({ symbol: "A", confluenceScore: 30 }),
                B: analysis({ symbol: "B", confluenceScore: 80 }),
                C: analysis({ symbol: "C", confluenceScore: 55 }),
            },
            true,
        );

        expect(rows.map((r) => r.symbol)).toEqual(["B", "C", "A"]);
    });

    it("flags symbols outside the analysis scope", () => {
        const rows = buildRows(["A", "B", "C", "D", "E"], {}, false);

        expect(rows.find((r) => r.symbol === "E")!.outOfScope).toBe(true);
        expect(rows.find((r) => r.symbol === "A")!.outOfScope).toBe(false);
    });
});

describe("marketHeat", () => {
    it("returns null rather than a fabricated middle when nothing is analysed", () => {
        expect(marketHeat(buildRows(["A", "B"], {}, true))).toBeNull();
    });

    it("averages only analysed symbols", () => {
        const rows = buildRows(
            ["A", "B", "C"],
            {
                A: analysis({ symbol: "A", rsi1h: "60" }),
                B: analysis({ symbol: "B", rsi1h: "40" }),
            },
            true,
        );

        // 50, not (60+40+placeholder)/3. The old version divided by the full
        // favourites count while summing only what existed.
        expect(marketHeat(rows)).toBe(50);
    });

    it("excludes partial analyses from the average", () => {
        const rows = buildRows(
            ["A", "B"],
            {
                A: analysis({ symbol: "A", rsi1h: "70" }),
                B: analysis({ symbol: "B", rsi1h: "10", quality: "partial" }),
            },
            true,
        );

        expect(marketHeat(rows)).toBe(70);
    });
});

describe("marketBreadth", () => {
    it("returns null when no 4h trend was measurable", () => {
        const rows = buildRows(
            ["A"],
            {
                A: analysis({
                    symbol: "A",
                    trends: { "15m": "unknown", "1h": "unknown", "4h": "unknown", "1d": "unknown" },
                }),
            },
            true,
        );

        expect(marketBreadth(rows)).toBeNull();
    });

    it("counts unknown as unmeasured, not as bearish", () => {
        const rows = buildRows(
            ["A", "B"],
            {
                A: analysis({ symbol: "A", trends: { "15m": "bullish", "1h": "bullish", "4h": "bullish", "1d": "bullish" } }),
                B: analysis({
                    symbol: "B",
                    trends: { "15m": "unknown", "1h": "unknown", "4h": "unknown", "1d": "unknown" },
                }),
            },
            true,
        );

        // 100% of ONE measured symbol -- and the sample size is published so
        // the reader can weigh it. Counting B as "not bullish" would report 50%.
        expect(marketBreadth(rows)).toEqual({
            percent: 100,
            sample: 1,
            bullish: 1,
            measured: 1,
        });
    });
});

describe("topOpportunity", () => {
    it("ranks by distance from neutral, so shorts can win", () => {
        const rows = buildRows(
            ["LONGISH", "SHORTY"],
            {
                LONGISH: analysis({ symbol: "LONGISH", confluenceScore: 65 }),
                SHORTY: analysis({ symbol: "SHORTY", confluenceScore: 10 }),
            },
            true,
        );

        // 10 is 40 from neutral; 65 is only 15. Ranking by raw score would
        // surface LONGISH and could never surface a short at all.
        expect(topOpportunity(rows)?.symbol).toBe("SHORTY");
    });

    it("ignores partial analyses", () => {
        const rows = buildRows(
            ["A", "B"],
            {
                A: analysis({ symbol: "A", confluenceScore: 55 }),
                B: analysis({ symbol: "B", confluenceScore: 95, quality: "partial" }),
            },
            true,
        );

        expect(topOpportunity(rows)?.symbol).toBe("A");
    });

    it("returns undefined when nothing is analysed", () => {
        expect(topOpportunity(buildRows(["A"], {}, true))).toBeUndefined();
    });
});

describe("signalFor", () => {
    it("maps each confluence level to a direction", () => {
        expect(signalFor(analysis({ symbol: "A", confluenceLevel: "Strong Buy" })).tone).toBe("bullish");
        expect(signalFor(analysis({ symbol: "A", confluenceLevel: "Buy" })).tone).toBe("bullish");
        expect(signalFor(analysis({ symbol: "A", confluenceLevel: "Sell" })).tone).toBe("bearish");
        expect(signalFor(analysis({ symbol: "A", confluenceLevel: "Strong Sell" })).tone).toBe("bearish");
        expect(signalFor(analysis({ symbol: "A", confluenceLevel: "Neutral" })).tone).toBe("flat");
    });

    it("treats a missing analysis as flat, never as a sell", () => {
        expect(signalFor(undefined).tone).toBe("flat");
    });
});

describe("trendCellClass", () => {
    it("renders unknown differently from neutral", () => {
        expect(trendCellClass("unknown")).not.toBe(trendCellClass("neutral"));
    });

    it("renders an absent trend like unknown, not like a reading", () => {
        expect(trendCellClass(undefined)).toBe(trendCellClass("unknown"));
    });

    it("keeps bullish and bearish distinct", () => {
        expect(trendCellClass("bullish")).not.toBe(trendCellClass("bearish"));
    });
});
