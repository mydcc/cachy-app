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
 * The journal store's paper analysis mirror (FEAT-0692).
 *
 * The deep dive reads real and paper figures from two separate derived sets.
 * The rule is not "the two may be shown next to each other" but "the two may
 * never mix": every paper metric is a function of the simulated entries
 * alone, every real metric a function of the real ones alone. This file pins
 * the separation from both sides.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: false, dev: true }));

const settings = vi.hoisted(() => ({ journalPaperTrades: true }));
vi.mock("./settings.svelte", () => ({ settingsState: settings }));

import { journalState } from "./journal.svelte";
import type { JournalEntry } from "./types";

function entry(id: string, pnl: string, isPaper?: boolean): JournalEntry {
    return {
        id,
        date: new Date("2026-08-16T10:00:00Z").toISOString(),
        exitDate: new Date("2026-08-16T11:00:00Z").toISOString(),
        symbol: "BTCUSDT",
        tradeType: "long",
        status: new Decimal(pnl).isNegative() ? "Lost" : "Won",
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(10),
        fees: new Decimal("0.05"),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49500),
        totalRR: new Decimal(1),
        totalNetProfit: new Decimal(pnl),
        riskAmount: new Decimal(10),
        totalFees: new Decimal(1),
        maxPotentialProfit: new Decimal(20),
        notes: "",
        targets: [],
        calculatedTpDetails: [],
        ...(isPaper === undefined ? {} : { isPaper }),
    } as JournalEntry;
}

beforeEach(() => {
    settings.journalPaperTrades = true;
    journalState.set([]);
});

describe("journal — the paper analysis mirror (FEAT-0692)", () => {
    it("splits the entries into a real and a paper population", () => {
        journalState.set([
            entry("r1", "100"),
            entry("p1", "-40", true),
            entry("r2", "-30"),
        ]);

        expect(journalState.analysisEntries.map((e) => e.id)).toEqual([
            "r1",
            "r2",
        ]);
        expect(journalState.paperEntries.map((e) => e.id)).toEqual(["p1"]);
    });

    it("computes the paper series from paper trades alone", () => {
        journalState.set([entry("r1", "100"), entry("p1", "-40", true)]);

        expect(
            journalState.paperPerformanceMetrics.equityCurve.map((p) => p.y),
        ).toEqual([-40]);
        expect(
            journalState.performanceMetrics.equityCurve.map((p) => p.y),
        ).toEqual([100]);
    });

    it("moves a paper fill only in the paper series, a real fill only in the real one", () => {
        journalState.set([entry("r1", "100")]);
        const realBefore = journalState.performanceMetrics;
        expect(journalState.paperPerformanceMetrics.equityCurve).toEqual([]);

        journalState.set([entry("r1", "100"), entry("p1", "250", true)]);

        // A simulated winner must not move a figure that claims to describe
        // real money …
        expect(journalState.performanceMetrics).toEqual(realBefore);
        // … and the paper series must never have seen the real fill.
        expect(
            journalState.paperPerformanceMetrics.equityCurve.map((p) => p.y),
        ).toEqual([250]);
    });

    it("never lets a simulated total into a real tag statistic", () => {
        journalState.set([entry("r1", "100"), entry("p1", "-40", true)]);

        expect(journalState.tagMetrics.pnlData.map((d) => d.toString())).toEqual(
            ["100"],
        );
        expect(
            journalState.paperTagMetrics.pnlData.map((d) => d.toString()),
        ).toEqual(["-40"]);
    });

    it("keeps both populations' six-segment split apart", () => {
        journalState.set([entry("r1", "100"), entry("p1", "-40", true)]);

        expect(journalState.qualityMetrics.sixSegmentData).toEqual([
            1, 0, 0, 0, 0, 0,
        ]);
        expect(journalState.paperQualityMetrics.sixSegmentData).toEqual([
            0, 0, 1, 0, 0, 0,
        ]);
    });

    it("reports an empty mirror for a journal without paper trades", () => {
        journalState.set([entry("r1", "100"), entry("r2", "-30")]);

        expect(journalState.paperEntries).toEqual([]);
        expect(
            journalState.paperPerformanceMetrics.equityCurve,
        ).toEqual([]);
    });
});
