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

/**
 * FEAT-0029 criteria: a sloped line's alert uses the level at the current
 * time (tested at two different times), and moving a drawing moves its alert.
 */

import { describe, expect, it, vi } from "vitest";

import type { ChartDrawing } from "../../lib/chart/drawings/types";
import type { RuleDocument } from "../../lib/rules/types";
import type { DrawingAnchorLedger, DrawingAnchorLedgerSnapshot } from "./drawingAnchors";
import { resolveDrawingThreshold, type DrawingThresholdPorts } from "./drawingThreshold";

const T0 = 1_757_030_400_000;
const HOUR = 3_600_000;

const trend: ChartDrawing = {
    kind: "trend",
    id: "draw-1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    fromMs: T0,
    fromPrice: "50000",
    toMs: T0 + 10 * HOUR,
    toPrice: "51000",
};

function rule(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id: "rule-1",
        name: "trend touch",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "1" },
            timeframe: "1h",
        },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
        ...overrides,
    } as RuleDocument;
}

function ports(overrides: Partial<DrawingThresholdPorts> = {}): DrawingThresholdPorts {
    const ledger: DrawingAnchorLedger = {
        "rule-1": { drawingId: "draw-1", symbol: "BTCUSDT", createdAtMs: T0 },
    };
    const snapshot: DrawingAnchorLedgerSnapshot = { present: true, ledger };
    return {
        ledger: () => snapshot,
        loadDrawings: () => {},
        drawing: (id) => (id === "draw-1" ? trend : null),
        storePresent: () => true,
        ...overrides,
    };
}

/** The constant the rewritten rule would be compared against. */
function threshold(result: ReturnType<typeof resolveDrawingThreshold>): string | null {
    if (result.kind !== "rewritten") return null;
    const condition = result.rule.conditions as { right: { value: string } };
    return condition.right.value;
}

describe("reading a drawing's level into a rule", () => {
    it("leaves an ordinary rule alone", () => {
        const plain = rule({ id: "rule-other" });

        expect(resolveDrawingThreshold(plain, T0, ports())).toEqual({ kind: "not-anchored" });
    });

    it("uses the level at the anchor, and a different one at a different time", () => {
        // The criterion, stated exactly: two timestamps, two thresholds, one
        // unchanged rule.
        expect(threshold(resolveDrawingThreshold(rule(), T0 + 2 * HOUR, ports()))).toBe("50200");
        expect(threshold(resolveDrawingThreshold(rule(), T0 + 8 * HOUR, ports()))).toBe("50800");
    });

    it("reads a horizontal line's price at every timestamp", () => {
        const flat: ChartDrawing = {
            kind: "horizontal",
            id: "draw-1",
            symbol: "BTCUSDT",
            createdAtMs: T0,
            price: "49500",
        };
        const p = ports({ drawing: () => flat });

        expect(threshold(resolveDrawingThreshold(rule(), T0, p))).toBe("49500");
        expect(threshold(resolveDrawingThreshold(rule(), T0 + 99 * HOUR, p))).toBe("49500");
    });

    it("follows the drawing when it moves, without replacing the rule", () => {
        // "Moving a drawing moves its alert" needs no code of its own — the
        // level is read fresh each time. What must not change is the rule's
        // identity, because the gate dedupes on it and the core reads fired
        // history keyed the same way.
        const moved: ChartDrawing = { ...trend, fromPrice: "60000", toPrice: "61000" };
        const before = resolveDrawingThreshold(rule(), T0 + 5 * HOUR, ports());
        const after = resolveDrawingThreshold(
            rule(),
            T0 + 5 * HOUR,
            ports({ drawing: () => moved }),
        );

        expect(threshold(before)).toBe("50500");
        expect(threshold(after)).toBe("60500");
        expect(after.kind === "rewritten" && after.rule.id).toBe("rule-1");
    });

    it("never mutates the stored document", () => {
        const stored = rule();

        resolveDrawingThreshold(stored, T0 + 5 * HOUR, ports());

        expect((stored.conditions as { right: { value: string } }).right.value).toBe("1");
    });

    it("keeps everything else about the rule", () => {
        const stored = rule({ name: "my line", enabled: true });

        const result = resolveDrawingThreshold(stored, T0, ports());

        expect(result.kind === "rewritten" && result.rule).toMatchObject({
            id: "rule-1",
            name: "my line",
            trigger_timeframe: "1h",
            enabled: true,
        });
    });
});

describe("refusing rather than guessing", () => {
    it("refuses when the drawing was deleted", () => {
        const result = resolveDrawingThreshold(rule(), T0, ports({ drawing: () => null }));

        expect(result).toEqual({
            kind: "unresolvable",
            reason: "drawing-missing",
            drawingId: "draw-1",
        });
    });

    it("distinguishes an unreadable store from a deletion", () => {
        // Absence is only evidence when the store was actually readable. This
        // reason must never disable anything — it means "I cannot tell".
        const result = resolveDrawingThreshold(
            rule(),
            T0,
            ports({ storePresent: () => false, drawing: () => null }),
        );

        expect(result).toMatchObject({ reason: "drawing-store-unreadable" });
    });

    it("refuses a vertical trend line", () => {
        const vertical: ChartDrawing = { ...trend, toMs: T0 };

        const result = resolveDrawingThreshold(rule(), T0, ports({ drawing: () => vertical }));

        expect(result).toMatchObject({ reason: "drawing-has-no-level" });
    });

    it("refuses a rule whose condition is not a single comparison", () => {
        // Searching a nested group for "the" constant would rewrite whichever
        // one it found first — plausible, and wrong half the time.
        const grouped = rule({
            conditions: {
                kind: "all",
                conditions: [
                    {
                        kind: "compare",
                        left: { kind: "price", field: "close" },
                        op: "gte",
                        right: { kind: "constant", value: "1" },
                        timeframe: "1h",
                    },
                ],
            },
        } as Partial<RuleDocument>);

        const result = resolveDrawingThreshold(grouped, T0, ports());

        expect(result).toMatchObject({ reason: "unsupported-condition" });
    });

    it("refuses a comparison against something that is not a constant", () => {
        const indicatorRight = rule({
            conditions: {
                kind: "compare",
                left: { kind: "price", field: "close" },
                op: "gte",
                right: { kind: "price", field: "open" },
                timeframe: "1h",
            },
        } as Partial<RuleDocument>);

        expect(resolveDrawingThreshold(indicatorRight, T0, ports())).toMatchObject({
            reason: "unsupported-condition",
        });
    });
});

describe("an unreadable anchor ledger — BUG-0498", () => {
    const unreadable = () => ({ present: false as const, ledger: {} });

    it("holds a drawing-shaped rule rather than evaluating its stored constant", () => {
        const result = resolveDrawingThreshold(rule(), T0, ports({ ledger: unreadable }));

        expect(result).toEqual({
            kind: "unresolvable",
            reason: "drawing-anchor-ledger-unreadable",
        });
    });

    it("leaves a rule the drawing feature could never produce alone", () => {
        const grouped = rule({
            conditions: {
                kind: "group",
                op: "all",
                of: [
                    {
                        kind: "compare",
                        left: { kind: "price", field: "close" },
                        op: "gte",
                        right: { kind: "constant", value: "1" },
                        timeframe: "1h",
                    },
                ],
            },
        } as unknown as RuleDocument);

        expect(resolveDrawingThreshold(grouped, T0, ports({ ledger: unreadable }))).toEqual({
            kind: "not-anchored",
        });
    });

    it("still resolves through a readable ledger", () => {
        expect(threshold(resolveDrawingThreshold(rule(), T0 + 2 * HOUR, ports()))).toBe("50200");
    });
});

describe("loading the drawing store — BUG-0484", () => {
    it("does not load the store for a rule anchored to no drawing", () => {
        const plain = rule({ id: "rule-other" });
        const loadDrawings = vi.fn();
        const portsWithCountingLoad = ports({ loadDrawings });

        expect(resolveDrawingThreshold(plain, T0, portsWithCountingLoad)).toEqual({
            kind: "not-anchored",
        });
        expect(loadDrawings).not.toHaveBeenCalled();
    });

    it("loads the store before reading a drawing the rule is anchored to", () => {
        const loadDrawings = vi.fn();
        const order: string[] = [];
        const trackingPorts = ports({
            loadDrawings: () => {
                order.push("load");
                loadDrawings();
            },
            drawing: (id) => {
                order.push("drawing");
                return id === "draw-1" ? trend : null;
            },
        });

        resolveDrawingThreshold(rule(), T0 + 2 * HOUR, trackingPorts);

        expect(loadDrawings).toHaveBeenCalledTimes(1);
        expect(order).toEqual(["load", "drawing"]);
    });
});
