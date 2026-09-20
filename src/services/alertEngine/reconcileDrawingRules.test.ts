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
 * FEAT-0029 criterion: deleting a drawing disables its alert with a reason the
 * panel shows, and deletes neither the rule nor its fired history.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DRAWINGS_STORAGE_KEY } from "../../lib/chart/drawings/types";
import type { RuleDocument } from "../../lib/rules/types";
import type { DrawingAnchorLedger } from "./drawingAnchors";
import {
    readDrawingStoreSnapshot,
    reconcileDrawingRules,
    type DrawingStoreSnapshot,
} from "./reconcileDrawingRules";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

function rule(id: string, enabled = true): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: id,
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
        enabled,
        provenance: { source: "human", created_at_ms: 0 },
    } as RuleDocument;
}

const ledger: DrawingAnchorLedger = {
    "rule-anchored": { drawingId: "draw-1", symbol: "BTCUSDT", createdAtMs: 0 },
};

const storeWith = (...ids: string[]): DrawingStoreSnapshot => ({
    present: true,
    ids: new Set(ids),
});
const storeGone: DrawingStoreSnapshot = { present: false, ids: new Set() };

beforeEach(() => {
    localStorage.clear();
});

describe("a drawing that is gone", () => {
    it("disables the rule that watched it", () => {
        const result = reconcileDrawingRules([rule("rule-anchored")], storeWith("other"), ledger);

        expect(result.suspended).toEqual(["rule-anchored"]);
        expect(result.rules[0].enabled).toBe(false);
    });

    it("keeps the rule itself, with everything on it", () => {
        // The criterion's second half: the rule and its history survive. What
        // changes is one flag.
        const original = rule("rule-anchored");

        const [reconciled] = reconcileDrawingRules([original], storeWith(), ledger).rules;

        expect(reconciled).toMatchObject({
            id: "rule-anchored",
            name: "rule-anchored",
            conditions: original.conditions,
            provenance: original.provenance,
        });
    });

    it("does not mutate the stored rule", () => {
        const original = rule("rule-anchored");

        reconcileDrawingRules([original], storeWith(), ledger);

        expect(original.enabled).toBe(true);
    });

    it("leaves a rule the trader already disabled out of the report", () => {
        const result = reconcileDrawingRules([rule("rule-anchored", false)], storeWith(), ledger);

        expect(result.suspended).toEqual([]);
    });
});

describe("a drawing that is still there", () => {
    it("leaves its rule armed", () => {
        const result = reconcileDrawingRules([rule("rule-anchored")], storeWith("draw-1"), ledger);

        expect(result.suspended).toEqual([]);
        expect(result.rules[0].enabled).toBe(true);
    });

    it("never touches a rule that watches no drawing", () => {
        const result = reconcileDrawingRules([rule("plain")], storeWith(), ledger);

        expect(result.suspended).toEqual([]);
        expect(result.rules[0].enabled).toBe(true);
    });
});

describe("a store that proves nothing", () => {
    it("withholds instead of disabling when the store could not be read", () => {
        // A fresh device or cleared site data would otherwise disarm every
        // drawing alert in one silent pass — the failure that can cost money.
        const result = reconcileDrawingRules([rule("rule-anchored")], storeGone, ledger);

        expect(result.suspended).toEqual([]);
        expect(result.withheld).toEqual(["rule-anchored"]);
        expect(result.rules[0].enabled).toBe(true);
    });

    it("does not report an already-disabled rule as withheld", () => {
        const result = reconcileDrawingRules([rule("rule-anchored", false)], storeGone, ledger);

        expect(result.withheld).toEqual([]);
    });
});

describe("reading the drawing store", () => {
    it("reports an empty but present store as present", () => {
        // The distinction the whole gate rests on: an empty list is a trader
        // with no drawings left, a missing key is a store that is gone.
        localStorage.setItem(
            DRAWINGS_STORAGE_KEY,
            JSON.stringify({ schema_version: 1, drawings: [] }),
        );

        expect(readDrawingStoreSnapshot()).toEqual({ present: true, ids: new Set() });
    });

    it("reports a missing key as absent", () => {
        expect(readDrawingStoreSnapshot().present).toBe(false);
    });

    it("reports unparseable bytes as absent rather than empty", () => {
        localStorage.setItem(DRAWINGS_STORAGE_KEY, "{not json");

        expect(readDrawingStoreSnapshot().present).toBe(false);
    });

    it("reports a document without a drawings list as absent", () => {
        localStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify({ schema_version: 1 }));

        expect(readDrawingStoreSnapshot().present).toBe(false);
    });

    it("collects the ids of a populated store", () => {
        localStorage.setItem(
            DRAWINGS_STORAGE_KEY,
            JSON.stringify({
                schema_version: 1,
                drawings: [
                    { id: "a", kind: "horizontal", symbol: "BTCUSDT", createdAtMs: 0, price: "1" },
                    { id: "b", kind: "horizontal", symbol: "BTCUSDT", createdAtMs: 0, price: "2" },
                ],
            }),
        );

        expect(readDrawingStoreSnapshot().ids).toEqual(new Set(["a", "b"]));
    });
});
