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

/*
 * FEAT-0822 — the guard decisions, pure.
 *
 * Every "may this bot act?" answer the engine needs, as functions over
 * plain data: the risk one entry carries, the risk an owned row still
 * holds, and which limits bind. Pure on purpose — the same function
 * answers the enforcement question (refuse a submission) and the
 * projection question (show `limit reached` on the row), so the two can
 * never disagree about whether a limit is reached.
 *
 * Money is Decimal end to end. The inputs arrive as strings off documents
 * and book rows; the first thing every function here does is convert.
 */

import { describe, expect, it } from "vitest";

import { Decimal } from "decimal.js";

import {
    entryRiskAmount,
    limitReasonsFor,
    localDayKey,
    openRiskOfRow,
    type GuardCheckInputs,
    type OwnedRowLite,
    type RestingOrderLite,
} from "./botGuards";

function row(overrides: Partial<OwnedRowLite> = {}): OwnedRowLite {
    return {
        positionId: "p-1",
        symbol: "BTCUSDT",
        side: "long",
        amount: "2",
        entryPrice: "100",
        ...overrides,
    };
}

function stopOrder(overrides: Partial<RestingOrderLite> = {}): RestingOrderLite {
    return {
        orderId: "o-1",
        symbol: "BTCUSDT",
        planType: "SL",
        triggerPrice: "90",
        reduceOnly: true,
        positionId: "p-1",
        ...overrides,
    };
}

function inputs(overrides: Partial<GuardCheckInputs> = {}): GuardCheckInputs {
    return {
        policy: "once_per_candle",
        entriesTotal: 0,
        entriesToday: 0,
        ownedCount: 0,
        riskUsed: new Decimal(0),
        ...overrides,
    };
}

describe("FEAT-0822 — the pure guard decisions", () => {
    it("prices one entry's risk from its stop, never from a stored guess", () => {
        // 2 units entered at 100, stopped at 90: the risk is the distance
        // times the quantity.
        expect(
            entryRiskAmount(new Decimal("100"), new Decimal("2"), new Decimal("90")).toString(),
        ).toBe("20");

        // A short risks upward: the absolute distance is the risk.
        expect(
            entryRiskAmount(new Decimal("100"), new Decimal("2"), new Decimal("115")).toString(),
        ).toBe("30");

        // A stop at the entry risks nothing — legal, and honestly zero.
        expect(
            entryRiskAmount(new Decimal("100"), new Decimal("2"), new Decimal("100")).toString(),
        ).toBe("0");
    });

    it("reads an owned row's open risk from its resting stop, by position id", () => {
        expect(openRiskOfRow(row(), [stopOrder()])?.toString()).toBe("20");

        // Another row's stop does not answer for this one.
        expect(
            openRiskOfRow(row({ positionId: "p-2" }), [stopOrder()])?.toString(),
        ).toBeUndefined();

        // A row whose stop has already filled (or never rested) holds no
        // measurable risk: null, not zero — zero would claim the position
        // is protected when nothing says it is.
        expect(openRiskOfRow(row(), [])).toBeNull();
        expect(openRiskOfRow(row(), [stopOrder({ reduceOnly: false })])).toBeNull();
    });

    it("prices the stop leg, never the row's take-profit", () => {
        // A take-profit of the same position is also reduce-only, carries
        // the same position id and a trigger price — the first match the
        // naive finder takes. Priced as a stop it would claim protection
        // the row does not have.
        const takeProfit = stopOrder({
            orderId: "o-tp",
            planType: "TP",
            triggerPrice: "120",
        });
        expect(openRiskOfRow(row(), [takeProfit])).toBeNull();

        // Both legs resting: the SL answers, wherever it sits in the array.
        const stopLeg = stopOrder({ orderId: "o-sl", triggerPrice: "90" });
        expect(
            openRiskOfRow(row(), [takeProfit, stopLeg])?.toString(),
        ).toBe("20");
    });

    it("treats a stop on the wrong side of its entry as unmeasurable", () => {
        // A long whose only resting trigger sits above its entry is not
        // protected below it — whatever the leg is called, the row can lose
        // everything under the market. Wrong side is not a smaller risk
        // number, it is the absence of one.
        const throughEntry = stopOrder({ triggerPrice: "110" });
        expect(openRiskOfRow(row(), [throughEntry])).toBeNull();

        // The short mirror: a short's loss side is above its entry, so a
        // trigger below it does not answer either.
        const shortRow = row({ side: "short", entryPrice: "100" });
        expect(openRiskOfRow(shortRow, [stopOrder({ triggerPrice: "90" })])).toBeNull();
        expect(openRiskOfRow(shortRow, [stopOrder({ triggerPrice: "110" })])?.toString()).toBe(
            "20",
        );
    });

    it("binds the once policy after the first landed entry, not the first attempt", () => {
        expect(limitReasonsFor(inputs({ policy: "once", entriesTotal: 1 }))).toEqual([
            "policy-once",
        ]);
        // A refused first attempt spent nothing: the bot may try again.
        expect(limitReasonsFor(inputs({ policy: "once", entriesTotal: 0 }))).toEqual([]);
        // The other policies never bind here.
        expect(limitReasonsFor(inputs({ policy: "multi", entriesTotal: 5 }))).toEqual([]);
        expect(
            limitReasonsFor(inputs({ policy: "once_per_candle", entriesTotal: 5 })),
        ).toEqual([]);
    });

    it("binds the day cap from the document, in document order after the policy", () => {
        expect(
            limitReasonsFor(inputs({ maxEntriesPerDay: 3, entriesToday: 3 })),
        ).toEqual(["entries-day"]);
        expect(
            limitReasonsFor(inputs({ maxEntriesPerDay: 3, entriesToday: 2 })),
        ).toEqual([]);
        // Both binding, both reported: the trader is told everything that
        // would refuse the next entry, in one pass.
        expect(
            limitReasonsFor(
                inputs({
                    policy: "once",
                    entriesTotal: 1,
                    maxEntriesPerDay: 1,
                    entriesToday: 1,
                }),
            ),
        ).toEqual(["policy-once", "entries-day"]);
    });

    it("binds the position cap only when the document states one", () => {
        // Absent means the existing single-open bound (FEAT-0488), which is
        // not this function's refusal to make — a position-already-open
        // refusal names it better, because it is true of every bot.
        expect(limitReasonsFor(inputs({ ownedCount: 1 }))).toEqual([]);
        expect(limitReasonsFor(inputs({ maxPositions: 1, ownedCount: 1 }))).toEqual([
            "positions",
        ]);
        expect(limitReasonsFor(inputs({ maxPositions: 3, ownedCount: 1 }))).toEqual([]);
    });

    it("binds the risk ceiling against the entry being submitted", () => {
        expect(
            limitReasonsFor(
                inputs({ maxRiskPerPosition: "100", entryRisk: new Decimal("150") }),
            ),
        ).toEqual(["risk"]);
        expect(
            limitReasonsFor(
                inputs({ maxRiskPerPosition: "100", entryRisk: new Decimal("100") }),
            ),
        ).toEqual([]);
        // Without an entry pending, a risk ceiling binds nothing.
        expect(limitReasonsFor(inputs({ maxRiskPerPosition: "100" }))).toEqual([]);
    });

    it("binds the budget against what the rows hold plus the pending entry", () => {
        // 40 held, 30 pending, 100 budget: the sum is the truth.
        expect(
            limitReasonsFor(
                inputs({
                    budgetCap: "100",
                    riskUsed: new Decimal("40"),
                    entryRisk: new Decimal("70"),
                }),
            ),
        ).toEqual(["budget"]);
        // Exactly at the cap is still allowed — the cap is inclusive.
        expect(
            limitReasonsFor(
                inputs({
                    budgetCap: "100",
                    riskUsed: new Decimal("40"),
                    entryRisk: new Decimal("60"),
                }),
            ),
        ).toEqual([]);
        // Held risk alone can exhaust the budget: the row state reads
        // `limit reached` before any entry is pending.
        expect(
            limitReasonsFor(inputs({ budgetCap: "100", riskUsed: new Decimal("100") })),
        ).toEqual(["budget"]);
    });

    it("keys the day locally, because 'today' is the trader's word", () => {
        const at = new Date(2026, 10, 19, 1, 30); // local 2026-11-19 01:30
        expect(localDayKey(at)).toBe("2026-11-19");
        // The UTC date can differ from the local one; the local one wins.
        const lateLocal = new Date(2026, 10, 19, 23, 30);
        expect(localDayKey(lateLocal)).toBe("2026-11-19");
        expect(localDayKey(new Date(2026, 10, 20, 0, 1))).toBe("2026-11-20");
    });
});
