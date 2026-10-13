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
 * FEAT-0677, AC 9 — every line the catalogue declares, against the engine.
 *
 * The chart draws what `computeLessonSeries` returns, so a declared output the
 * engine refuses has to fail here rather than reach a canvas. Two properties
 * are asserted for every registry indicator: the lines are the declared set in
 * the declared order, and each one carries data — a line of nothing but `null`s
 * satisfies a length check and paints nothing.
 */

import { describe, expect, it } from "vitest";

import { catalogueEntry, REGISTRY_CATALOGUE } from "../alerts/indicatorCatalogue";
import { computeLessonSeries } from "./indicatorLessonSeries";
import type { EvaluationCandle } from "../rules/types";

/** Longer than the widest warmup, and non-monotonic. */
const CANDLE_COUNT = 240;

function candles(count = CANDLE_COUNT): EvaluationCandle[] {
    const out: EvaluationCandle[] = [];
    for (let i = 0; i < count; i++) {
        // Deterministic and varied. A flat series makes the bandwidth and the
        // stochastic family divide by zero, which would exercise the edge case
        // instead of the line.
        const open = 100 + Math.sin(i / 3) * 4 + (i % 7);
        const close = open + Math.cos(i / 5) * 1.5;
        out.push({
            open_time_ms: 1_700_000_000_000 + i * 3_600_000,
            open: open.toFixed(8),
            high: (Math.max(open, close) + 1).toFixed(8),
            low: (Math.min(open, close) - 1).toFixed(8),
            close: close.toFixed(8),
            volume: (1_000 + (i % 13) * 5).toFixed(8),
        });
    }
    return out;
}

describe("indicator lesson series", () => {
    it("computes every line the catalogue declares, for every registry indicator", () => {
        const rows = candles();

        // Non-vacuity: the catalogue is not empty, and more than one indicator
        // declares more than one line — otherwise "every line" would be a
        // single-line claim and AC 9 would not be exercised at all.
        expect(REGISTRY_CATALOGUE.length).toBeGreaterThan(0);
        expect(
            REGISTRY_CATALOGUE.filter((entry) => entry.outputs.length > 1).length,
        ).toBeGreaterThan(0);

        const problems: string[] = [];
        for (const entry of REGISTRY_CATALOGUE) {
            const { lines, refused } = computeLessonSeries(entry, rows, "1h");

            for (const refusal of refused) {
                problems.push(`${entry.id}.${refusal.name} refused: ${refusal.reason}`);
            }

            const declared = entry.outputs.map((output) => output.name).join(",");
            const produced = lines.map((line) => line.name).join(",");
            if (produced !== declared) {
                problems.push(`${entry.id}: declared [${declared}] but produced [${produced}]`);
            }

            for (const line of lines) {
                if (line.values.length !== rows.length) {
                    problems.push(
                        `${entry.id}.${line.name}: ${line.values.length} values for ${rows.length} candles`,
                    );
                }
                if (!line.values.some((value) => value !== null)) {
                    problems.push(
                        `${entry.id}.${line.name}: every value is null, so it would draw nothing`,
                    );
                }
            }
        }

        expect(problems).toEqual([]);
    });

    it("produces one line per declared output, so a multi-line indicator is not truncated", () => {
        const rows = candles();
        const multi = REGISTRY_CATALOGUE.filter((entry) => entry.outputs.length > 1);
        expect(multi.length).toBeGreaterThan(0);

        for (const entry of multi) {
            expect(computeLessonSeries(entry, rows, "1h").lines.length, entry.id).toBe(
                entry.outputs.length,
            );
        }
    });

    it("merges the caller's parameters over the catalogue defaults, not instead of them", () => {
        const rows = candles();
        const macd = catalogueEntry("macd");
        if (!macd) throw new Error("no catalogue entry for macd");

        const defaults = computeLessonSeries(macd, rows, "1h");
        const overridden = computeLessonSeries(macd, rows, "1h", { fast_period: 5 });

        // Same lines, different arithmetic: the override reached the engine.
        expect(overridden.lines.map((line) => line.name)).toEqual(
            defaults.lines.map((line) => line.name),
        );
        expect(overridden.lines.find((line) => line.name === "macd")?.values).not.toEqual(
            defaults.lines.find((line) => line.name === "macd")?.values,
        );

        // The parameters it was *not* handed stayed the catalogue's. `signal` is
        // an EMA of `macd`, so moving the signal period must move `signal` and
        // leave `macd` where the catalogue defaults put it — which is what a
        // reversed spread (`{ ...params, ...defaults }`) would break.
        const signalOnly = computeLessonSeries(macd, rows, "1h", { signal_period: 3 });
        expect(signalOnly.lines.find((line) => line.name === "macd")?.values).toEqual(
            defaults.lines.find((line) => line.name === "macd")?.values,
        );
        expect(signalOnly.lines.find((line) => line.name === "signal")?.values).not.toEqual(
            defaults.lines.find((line) => line.name === "signal")?.values,
        );
    });

    it("accepts a string-valued parameter, which is the type the chart prop carries", () => {
        const rows = candles();
        const bollinger = catalogueEntry("bollinger");
        if (!bollinger) throw new Error("no catalogue entry for bollinger");

        // The seed's `factor()` produces a decimal string, and `ParamValue` is
        // `number | DecimalString` — so a numeric-only test would leave the type
        // the settings actually hand over unexercised.
        const wider = computeLessonSeries(bollinger, rows, "1h", { std_dev: "3" });
        const defaults = computeLessonSeries(bollinger, rows, "1h");

        const upper = wider.lines.find((line) => line.name === "upper")?.values ?? [];
        expect(upper.some((value) => value !== null)).toBe(true);
        expect(upper).not.toEqual(
            defaults.lines.find((line) => line.name === "upper")?.values ?? [],
        );
    });
});
