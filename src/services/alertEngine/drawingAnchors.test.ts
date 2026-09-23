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
 * BUG-0498 — the anchor ledger must report loss instead of flattening it to
 * an honest empty.
 *
 * A lost binding turns a line alert back into the constant it was created
 * with, and with an order intent that constant sizes and submits. The read
 * side therefore distinguishes "nothing was ever anchored" (`present` with an
 * empty ledger) from "the bindings could not be read" (absent), and the write
 * side reports whether the binding landed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import {
    RULE_DRAWING_STORAGE_KEY,
    readDrawingAnchorLedger,
    recordDrawingAnchor,
} from "./drawingAnchors";
import { resolveDrawingThreshold } from "./drawingThreshold";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));
vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const T0 = 1_757_030_400_000;

function drawingRule(id = "rule-1"): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: "line alert",
        symbol: "BTCUSDT",
        trigger_timeframe: "1h",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "50000" },
            timeframe: "1h",
        },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: T0 },
    } as RuleDocument;
}

/** A rule shape the drawing feature could never have produced. */
function groupRule(): RuleDocument {
    return {
        ...drawingRule("rule-group"),
        conditions: {
            kind: "group",
            op: "all",
            of: [
                {
                    kind: "compare",
                    left: { kind: "price", field: "close" },
                    op: "gte",
                    right: { kind: "constant", value: "50000" },
                    timeframe: "1h",
                },
            ],
        },
    } as RuleDocument;
}

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("reading the anchor ledger", () => {
    it("reports an honest empty when no ledger was ever written", () => {
        expect(readDrawingAnchorLedger()).toEqual({ present: true, ledger: {} });
    });

    it("round-trips a written binding as present", () => {
        const written = recordDrawingAnchor("rule-1", {
            drawingId: "draw-1",
            symbol: "BTCUSDT",
            createdAtMs: T0,
        });

        expect(written.ok).toBe(true);
        expect(readDrawingAnchorLedger()).toEqual({
            present: true,
            ledger: {
                "rule-1": { drawingId: "draw-1", symbol: "BTCUSDT", createdAtMs: T0 },
            },
        });
    });

    it("reports loss rather than an honest empty for corrupt JSON", () => {
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, "not-json{{{");

        const snapshot = readDrawingAnchorLedger();

        expect(snapshot.present).toBe(false);
        expect(snapshot.ledger).toEqual({});
        expect(logger.warn).toHaveBeenCalled();
    });

    it("reports loss for a document that holds no ledger", () => {
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, JSON.stringify(["not", "a", "ledger"]));

        expect(readDrawingAnchorLedger().present).toBe(false);
    });
});

describe("a lost ledger at evaluation time — BUG-0498", () => {
    function resolveThroughStorage(rule: RuleDocument) {
        return resolveDrawingThreshold(rule, T0, {
            ledger: readDrawingAnchorLedger,
            drawing: () => null,
            storePresent: () => true,
        });
    }

    it("holds a drawing-shaped rule unevaluable instead of firing its stored constant", () => {
        // The trader moved the line to 95,000; the stored constant still says
        // 100,000 and the binding proving otherwise is gone.
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, "not-json{{{");

        const result = resolveThroughStorage(drawingRule());

        expect(result).toEqual({
            kind: "unresolvable",
            reason: "drawing-anchor-ledger-unreadable",
        });
    });

    it("keeps a rule that was never drawing-anchored evaluating normally", () => {
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, "not-json{{{");

        expect(resolveThroughStorage(groupRule())).toEqual({ kind: "not-anchored" });
    });

    it("keeps the honest empty evaluating normally", () => {
        expect(resolveThroughStorage(drawingRule())).toEqual({ kind: "not-anchored" });
    });
});

describe("writing the anchor ledger", () => {
    it("reports a failed write instead of claiming the ledger as written", () => {
        const setItem = vi.spyOn(localStorage, "setItem").mockImplementation((key: string) => {
            if (key === RULE_DRAWING_STORAGE_KEY) throw new Error("quota exceeded");
        });

        const written = recordDrawingAnchor("rule-1", {
            drawingId: "draw-1",
            symbol: "BTCUSDT",
            createdAtMs: T0,
        });

        expect(written.ok).toBe(false);
        expect(readDrawingAnchorLedger()).toEqual({ present: true, ledger: {} });
        setItem.mockRestore();
    });
});
