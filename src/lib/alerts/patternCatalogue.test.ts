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

/*
 * FEAT-0394 -- the catalogue against the real core, not against a copy of it.
 *
 * This module mirrors three facts that actually live in Rust: the pattern
 * names, how many candles each spans, and how much history each needs. A
 * mirror that is merely written carefully drifts the first time someone edits
 * one side. So every one of those three is checked against the committed wasm
 * artefact here rather than re-asserted by hand.
 *
 * The fourth coupling is with the Academy illustration library, which shares
 * the ids so the tab can show a drawing. That one is checked too: FEAT-0394
 * says the two files share ids and nothing else, and a share that nothing
 * enforces is a share that lapses.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import {
    ALL_PATTERNS,
    CANDLES_SPANNED,
    NEEDS_TREND_CONTEXT,
    PATTERN_GLYPHS,
    PATTERN_GROUPS,
    PATTERN_GROUP_ORDER,
    buildPatternCondition,
    groupOf,
    readPatternForm,
    warmupCandles,
} from "./patternCatalogue";
import { CANDLESTICK_PATTERNS } from "../../services/candlestickPatterns";
import type { CandlePatternName, Condition } from "../rules/types";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

interface RuleCore {
    rule_validate(documentJson: string): string;
    rule_warmup_candles(documentJson: string): number;
}

let core: RuleCore;

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    } & RuleCore;
    await mod.default(readFileSync(WASM_BINARY));
    core = mod;
});

/** A minimal document carrying nothing but the pattern under test. */
function patternDoc(pattern: string, timeframe = "4h"): string {
    return JSON.stringify({
        schema_version: 1,
        id: "rule-catalogue",
        name: `${pattern} on ${timeframe}`,
        symbol: "BTCUSDT",
        trigger_timeframe: timeframe,
        conditions: { kind: "pattern", pattern, timeframe },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 1_700_000_000_000 },
    });
}

/*
 * The runtime-complete list of the union.
 *
 * `PATTERN_GLYPHS` is a `Record<CandlePatternName, ...>` declared in a source
 * file, so the compiler refuses a missing key -- and unlike the same trick in
 * `WindowRegistry.test.ts`, this one is armed, because `tsconfig.json` compiles
 * source and not tests (BUG-0434). That makes its keys a trustworthy
 * enumeration of the union at runtime, which a TypeScript type cannot give us
 * directly.
 */
const UNION_MEMBERS = Object.keys(PATTERN_GLYPHS) as CandlePatternName[];

describe("the pattern catalogue against the real rule core (FEAT-0394)", () => {
    it("offers every pattern the core accepts, and no name it does not", () => {
        for (const pattern of ALL_PATTERNS) {
            expect(
                () => core.rule_validate(patternDoc(pattern)),
                `the tab offers '${pattern}' but the core refuses it`,
            ).not.toThrow();
        }
    });

    it("agrees with the core on how much history each pattern needs", () => {
        // The number the tab shows a trader and the number the loop withholds
        // evaluation on must be the same number. If they part, the tab promises
        // an alarm that the loop is still warming up for -- which looks exactly
        // like an alarm that is broken.
        for (const pattern of ALL_PATTERNS) {
            expect(warmupCandles(pattern), `warmup for '${pattern}'`).toBe(
                core.rule_warmup_candles(patternDoc(pattern)),
            );
        }
    });

    it("refuses a pattern name by name rather than ignoring it", () => {
        // The whole point of the serde tagging on the Rust side. A typo must
        // not degrade into a rule that parses and then never fires.
        expect(() => core.rule_validate(patternDoc("hamer"))).toThrow();
        expect(() => core.rule_validate(patternDoc("engulfing"))).toThrow();
    });
});

describe("the catalogue's internal agreement", () => {
    it("groups every pattern exactly once", () => {
        const grouped = PATTERN_GROUP_ORDER.flatMap((g) => [...PATTERN_GROUPS[g]]);
        expect([...grouped].sort()).toEqual([...UNION_MEMBERS].sort());
        expect(new Set(grouped).size, "a pattern appears in two groups").toBe(grouped.length);
    });

    it("gives every pattern a glyph with as many candles as its group spans", () => {
        for (const pattern of UNION_MEMBERS) {
            expect(PATTERN_GLYPHS[pattern].length, `glyph candles for '${pattern}'`).toBe(
                CANDLES_SPANNED[groupOf(pattern)],
            );
        }
    });

    it("draws glyphs that are real candles", () => {
        // A tile that shows a high below its own body teaches a shape the
        // detector would never accept.
        for (const pattern of UNION_MEMBERS) {
            for (const [i, c] of PATTERN_GLYPHS[pattern].entries()) {
                expect(c.high, `${pattern}[${i}] high`).toBeGreaterThanOrEqual(
                    Math.max(c.open, c.close),
                );
                expect(c.low, `${pattern}[${i}] low`).toBeLessThanOrEqual(
                    Math.min(c.open, c.close),
                );
                expect(c.high, `${pattern}[${i}] range`).toBeGreaterThan(c.low);
            }
        }
    });

    it("asks for trend context only where the shape is ambiguous without it", () => {
        // Hammer/hanging man and inverted hammer/shooting star are two
        // silhouettes with four names. Everything else is readable on its own.
        expect([...NEEDS_TREND_CONTEXT].sort()).toEqual(
            ["hammer", "hanging_man", "inverted_hammer", "shooting_star"].sort(),
        );
        for (const pattern of NEEDS_TREND_CONTEXT) {
            expect(groupOf(pattern), `'${pattern}' reads trend but spans >1 candle`).toBe("single");
        }
    });
});

describe("the shared ids with the Academy illustration library", () => {
    it("finds an Academy illustration for every pattern the tab offers", () => {
        // FEAT-0394: the two files share pattern ids so the alert UI can reuse
        // the existing drawings and translations. Nothing but this test holds
        // that share together -- the detector does not import the library and
        // must not.
        const academy = new Set(CANDLESTICK_PATTERNS.map((p) => p.id));
        const orphans = UNION_MEMBERS.filter((p) => !academy.has(p));
        expect(orphans, "pattern ids with no Academy illustration").toEqual([]);
    });
});

describe("reading a draft back into the form (FEAT-0395)", () => {
    it("recovers the pattern a draft already carries", () => {
        const condition = buildPatternCondition("morning_star", "1h");
        expect(readPatternForm(condition)).toEqual({ pattern: "morning_star" });
    });

    it("looks inside the one-element group the panel may wrap it in", () => {
        // Found by the component test, not by this file: reading
        // `conditions.kind` directly sees "group", concludes the draft holds no
        // pattern, and drops a seeded choice. The unit test passed because it
        // handed in a bare condition -- the same assumption the bug was made of.
        const wrapped: Condition = {
            kind: "group",
            op: "all",
            of: [buildPatternCondition("bearish_engulfing", "4h")],
        };
        expect(readPatternForm(wrapped)).toEqual({ pattern: "bearish_engulfing" });
    });

    it("reads a real combo as nothing chosen rather than as its first leg", () => {
        // Showing one condition of a two-condition rule as "the" pattern would
        // misdescribe what is armed.
        const combo: Condition = {
            kind: "group",
            op: "all",
            of: [
                buildPatternCondition("hammer", "4h"),
                buildPatternCondition("morning_star", "4h"),
            ],
        };
        expect(readPatternForm(combo)).toEqual({ pattern: null });
    });

    it("reads a condition from another tab as nothing chosen, not as a crash", () => {
        const fromPriceTab: Condition = {
            kind: "cross",
            left: { kind: "price", field: "close" },
            direction: "above",
            right: { kind: "constant", value: "60000" },
            timeframe: "4h",
        };
        expect(readPatternForm(fromPriceTab)).toEqual({ pattern: null });
        expect(readPatternForm(null)).toEqual({ pattern: null });
        expect(readPatternForm(undefined)).toEqual({ pattern: null });
    });

    it("carries the timeframe the draft is anchored to", () => {
        expect(buildPatternCondition("hammer", "15m")).toEqual({
            kind: "pattern",
            pattern: "hammer",
            timeframe: "15m",
        });
    });
});
