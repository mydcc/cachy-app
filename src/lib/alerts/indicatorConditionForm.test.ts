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

import { describe, expect, it } from "vitest";

import { catalogueEntry, defaultRef } from "./indicatorCatalogue";
import {
    buildIndicatorCondition,
    compatibleIndicators,
    defaultForm,
    isReferenceCompatible,
    readIndicatorForm,
    type IndicatorForm,
} from "./indicatorConditionForm";
import { INDICATOR_CATALOGUE } from "./indicatorCatalogue";
import type { Condition } from "../rules/types";

const rsi = catalogueEntry("rsi")!;
const ema = catalogueEntry("ema")!;
const bollinger = catalogueEntry("bollinger")!;
const obv = catalogueEntry("obv")!;

describe("building a condition from the form", () => {
    it("writes a compare condition with the indicator on the left", () => {
        const condition = buildIndicatorCondition(defaultForm(rsi), "1h");
        expect(condition).toEqual({
            kind: "compare",
            left: { kind: "indicator", indicator: defaultRef(rsi) },
            op: "gt",
            right: { kind: "constant", value: "0" },
            timeframe: "1h",
        });
    });

    it("writes a cross condition when the relation is a crossing", () => {
        const form: IndicatorForm = {
            subject: defaultRef(ema),
            relation: { kind: "cross", direction: "above" },
            reference: { kind: "price", field: "close" },
        };
        expect(buildIndicatorCondition(form, "15m")).toEqual({
            kind: "cross",
            left: { kind: "indicator", indicator: defaultRef(ema) },
            direction: "above",
            right: { kind: "price", field: "close" },
            timeframe: "15m",
        });
    });

    it("carries the configured parameters, not the defaults of the id", () => {
        // The point of FEAT-0395's second half, asserted here where the
        // conversion happens: a trader who set RSI to 21 must not be armed on 14.
        const form: IndicatorForm = {
            ...defaultForm(rsi),
            subject: { id: "rsi", params: { period: 21 }, output: "value" },
        };
        const condition = buildIndicatorCondition(form, "1h");
        expect(condition.kind === "compare" && condition.left).toEqual({
            kind: "indicator",
            indicator: { id: "rsi", params: { period: 21 }, output: "value" },
        });
    });
});

describe("reading the form back out of a draft", () => {
    it("round-trips a compare condition", () => {
        const form = defaultForm(rsi);
        expect(readIndicatorForm(buildIndicatorCondition(form, "1h"))).toEqual(form);
    });

    it("round-trips a cross against a second indicator", () => {
        const form: IndicatorForm = {
            subject: defaultRef(ema),
            relation: { kind: "cross", direction: "below" },
            reference: { kind: "indicator", indicator: { id: "sma", params: { period: 50 } } },
        };
        expect(readIndicatorForm(buildIndicatorCondition(form, "4h"))).toEqual(form);
    });

    it("reads through a one-element group, the way the panel may store it", () => {
        const inner = buildIndicatorCondition(defaultForm(rsi), "1h");
        const wrapped: Condition = { kind: "group", op: "all", of: [inner] };
        expect(readIndicatorForm(wrapped)).toEqual(defaultForm(rsi));
    });

    it("returns null for a real combo rather than showing a fragment as the rule", () => {
        const inner = buildIndicatorCondition(defaultForm(rsi), "1h");
        const combo: Condition = { kind: "group", op: "all", of: [inner, inner] };
        expect(readIndicatorForm(combo)).toBeNull();
    });

    it("returns null for a condition this tab does not edit", () => {
        expect(readIndicatorForm({ kind: "pattern", pattern: "hammer", timeframe: "1h" })).toBeNull();
        expect(
            readIndicatorForm({
                kind: "compare",
                left: { kind: "price", field: "close" },
                op: "gt",
                right: { kind: "constant", value: "1" },
                timeframe: "1h",
            }),
        ).toBeNull();
    });

    it("returns null when the draft has a price reference with a source", () => {
        // A mark-price vs last-price reference cannot be round-tripped through
        // this tab, so it is rejected rather than silently normalized to last.
        expect(
            readIndicatorForm({
                kind: "compare",
                left: { kind: "indicator", indicator: defaultRef(rsi) },
                op: "gt",
                right: { kind: "price", field: "close", source: "mark" },
                timeframe: "1h",
            }),
        ).toBeNull();
    });

    it("returns null for an indicator this build no longer knows", () => {
        // Rather than rendering an empty picker that rewrites the rule on the
        // first edit -- a saved alert quietly becoming a different alert.
        expect(
            readIndicatorForm({
                kind: "compare",
                left: { kind: "indicator", indicator: { id: "vwap", params: {} } },
                op: "gt",
                right: { kind: "constant", value: "1" },
                timeframe: "1h",
            }),
        ).toBeNull();
    });

    it("returns null when the right-hand side is an operand this tab cannot render", () => {
        expect(
            readIndicatorForm({
                kind: "compare",
                left: { kind: "indicator", indicator: defaultRef(obv) },
                op: "gt",
                right: { kind: "window", of: { kind: "volume" }, agg: "max", lookback: 20 },
                timeframe: "1h",
            }),
        ).toBeNull();
    });
});

describe("the dimension gate the picker applies", () => {
    it("accepts a constant against anything", () => {
        for (const dimension of ["price", "percent", "volume", "unitless"] as const) {
            expect(isReferenceCompatible(dimension, { kind: "constant", value: "1" })).toBe(true);
        }
    });

    it("accepts a price only against a price", () => {
        expect(isReferenceCompatible("price", { kind: "price", field: "close" })).toBe(true);
        expect(isReferenceCompatible("percent", { kind: "price", field: "close" })).toBe(false);
        expect(isReferenceCompatible("volume", { kind: "price", field: "close" })).toBe(false);
    });

    it("refuses an indicator whose output is denominated differently", () => {
        // `volume > ema(20)` is the pairing the core refuses with
        // `operand_dimension_mismatch`; here it is not offered in the first place.
        expect(
            isReferenceCompatible("volume", {
                kind: "indicator",
                indicator: defaultRef(ema),
            }),
        ).toBe(false);
        expect(
            isReferenceCompatible("volume", {
                kind: "indicator",
                indicator: { id: "volume_ma", params: { period: 20 }, output: "value" },
            }),
        ).toBe(true);
    });

    it("reads the dimension off the output line, not off the indicator", () => {
        // Bollinger is both at once: bands are prices, percent_b is unitless.
        expect(
            isReferenceCompatible("price", {
                kind: "indicator",
                indicator: { id: "bollinger", params: {}, output: "upper" },
            }),
        ).toBe(true);
        expect(
            isReferenceCompatible("price", {
                kind: "indicator",
                indicator: { id: "bollinger", params: {}, output: "percent_b" },
            }),
        ).toBe(false);
        expect(bollinger.outputs.map((output) => output.dimension)).toContain("unitless");
    });

    it("offers only indicators that have a line in the subject's dimension", () => {
        const forVolume = compatibleIndicators("volume", INDICATOR_CATALOGUE).map((e) => e.id);
        expect(forVolume).toEqual(["obv", "volume_ma"]);
        expect(compatibleIndicators("price", INDICATOR_CATALOGUE).map((e) => e.id)).toContain("ema");
        expect(compatibleIndicators("percent", INDICATOR_CATALOGUE).map((e) => e.id)).toContain(
            "rsi",
        );
    });
});
