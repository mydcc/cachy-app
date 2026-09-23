/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom

/**
 * FEAT-0029 criterion: an alert on a horizontal line fires on crossing.
 *
 * "On crossing" is built from two choices this file pins down — the direction
 * is taken from where price currently sits, and `frequency` is left absent so
 * the core reads it as `once`. Get either wrong and the alert announces itself
 * the moment it is armed.
 */

import { Decimal } from "decimal.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChartDrawing } from "../../lib/chart/drawings/types";
import { RULE_DRAWING_STORAGE_KEY, readDrawingAnchorLedger } from "./drawingAnchors";
import { armDrawingAlert, buildDrawingAlert } from "./createDrawingAlert";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

const T0 = 1_757_030_400_000;
const HOUR = 3_600_000;

const flat: ChartDrawing = {
    kind: "horizontal",
    id: "draw-1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    price: "50000",
};

const sloped: ChartDrawing = {
    kind: "trend",
    id: "draw-2",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    fromMs: T0,
    fromPrice: "50000",
    toMs: T0 + 10 * HOUR,
    toPrice: "51000",
};

function request(overrides: Partial<Parameters<typeof buildDrawingAlert>[0]> = {}) {
    return {
        drawing: flat,
        timeframe: "1h",
        currentPrice: new Decimal("49000"),
        nowMs: T0,
        ...overrides,
    };
}

/** The comparison the built rule carries. */
function comparison(result: ReturnType<typeof buildDrawingAlert>) {
    if (!result.ok) throw new Error("expected a rule");
    return result.rule.conditions as { op: string; right: { value: string } };
}

beforeEach(() => {
    localStorage.clear();
});

// A throwing assertion mid-test must never leak its storage spy into the
// next test: restore every spy after every test, not at each test's tail.
afterEach(() => {
    vi.restoreAllMocks();
});

describe("which way the alert watches", () => {
    it("watches upward when price is below the line", () => {
        expect(comparison(buildDrawingAlert(request())).op).toBe("gte");
    });

    it("watches downward when price is above the line", () => {
        const result = buildDrawingAlert(request({ currentPrice: new Decimal("51000") }));

        expect(comparison(result).op).toBe("lte");
    });

    it("refuses when price is exactly on the line", () => {
        // Either direction would hold immediately, so the alert would announce
        // itself before the trader let go of the mouse.
        const result = buildDrawingAlert(request({ currentPrice: new Decimal("50000") }));

        expect(result).toEqual({ ok: false, reason: "price-on-the-line" });
    });

    it("refuses a drawing with no level at all", () => {
        const vertical: ChartDrawing = { ...sloped, toMs: T0 };

        expect(buildDrawingAlert(request({ drawing: vertical }))).toEqual({
            ok: false,
            reason: "drawing-has-no-level",
        });
    });
});

describe("the rule it builds", () => {
    it("leaves frequency absent, which the core reads as once", () => {
        // This is the other half of "fires on crossing": a rule that announced
        // on every candle while price stayed past the line would be a standing
        // condition, not a crossing.
        const result = buildDrawingAlert(request());

        expect(result.ok && "frequency" in result.rule).toBe(false);
    });

    it("seeds the threshold with the level at that moment", () => {
        const result = buildDrawingAlert(
            request({ drawing: sloped, nowMs: T0 + 5 * HOUR, currentPrice: new Decimal("49000") }),
        );

        expect(comparison(result).right.value).toBe("50500");
    });

    it("takes the symbol and timeframe from the drawing and the chart", () => {
        const result = buildDrawingAlert(request({ timeframe: "4h" }));

        expect(result.ok && result.rule).toMatchObject({
            symbol: "BTCUSDT",
            trigger_timeframe: "4h",
            enabled: true,
            action: { consequence_level: "notify" },
        });
    });

    it("uses the drawing's own label when it has one", () => {
        const labelled: ChartDrawing = { ...flat, label: "weekly support" };

        const result = buildDrawingAlert(request({ drawing: labelled }));

        expect(result.ok && result.rule.name).toBe("weekly support");
    });
});

describe("arming it", () => {
    it("stores the rule and records which drawing it watches", () => {
        const result = armDrawingAlert(request());

        expect(result.ok).toBe(true);
        const ruleId = result.ok ? result.rule.id : "";
        expect(readDrawingAnchorLedger().ledger[ruleId]).toMatchObject({
            drawingId: "draw-1",
            symbol: "BTCUSDT",
        });
    });

    it("gives each alert its own id", () => {
        const first = armDrawingAlert(request());
        const second = armDrawingAlert(request());

        expect(first.ok && second.ok && first.rule.id).not.toBe(second.ok && second.rule.id);
        expect(Object.keys(readDrawingAnchorLedger().ledger)).toHaveLength(2);
    });

    it("writes nothing when the drawing is refused", () => {
        armDrawingAlert(request({ currentPrice: new Decimal("50000") }));

        expect(readDrawingAnchorLedger().ledger).toEqual({});
    });
});

describe("a binding that cannot be persisted — BUG-0498", () => {
    function failWritesFor(key: string) {
        const original = localStorage.setItem.bind(localStorage);
        return vi.spyOn(localStorage, "setItem").mockImplementation((k: string, v: string) => {
            if (k === key) throw new Error("quota exceeded");
            original(k, v);
        });
    }

    function storedRules(): unknown[] {
        const raw = localStorage.getItem(RULES_STORAGE_KEY);
        return raw === null ? [] : (JSON.parse(raw) as unknown[]);
    }

    it("refuses instead of reporting the alert armed when the anchor write fails", () => {
        failWritesFor(RULE_DRAWING_STORAGE_KEY);

        const result = armDrawingAlert(request());

        expect(result).toEqual({ ok: false, reason: "drawing-anchor-not-persisted" });
    });

    it("leaves no phantom constant alert behind a failed anchor write", () => {
        failWritesFor(RULE_DRAWING_STORAGE_KEY);

        armDrawingAlert(request());

        expect(storedRules()).toHaveLength(0);
        expect(readDrawingAnchorLedger().ledger).toEqual({});
    });

    it("refuses when the rule store itself cannot be written", () => {
        failWritesFor(RULES_STORAGE_KEY);

        const result = armDrawingAlert(request());

        expect(result).toEqual({ ok: false, reason: "drawing-anchor-not-persisted" });
        expect(storedRules()).toHaveLength(0);
    });
});
