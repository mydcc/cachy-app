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

function entry(
    id: string,
    pnl: string,
    isPaper?: boolean,
    overrides: Partial<JournalEntry> = {},
): JournalEntry {
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
        ...overrides,
    } as JournalEntry;
}

beforeEach(() => {
    settings.journalPaperTrades = true;
    journalState.set([]);
});

/**
 * A full population with enough closed trades and enough per-trade context
 * (risk, ATR, MFE/MAE, tags) that every metric family has something to say —
 * otherwise the cross-population guard below would compare two silences.
 * 30 is the smallest sample the SQN family accepts.
 */
const POPULATION_SIZE = 30;

function population(isPaper: boolean): JournalEntry[] {
    return Array.from({ length: POPULATION_SIZE }, (_, i) =>
        entry(`${isPaper ? "p" : "r"}${i}`, isPaper ? "-4" : "10", isPaper, {
            atrValue: new Decimal(isPaper ? "2" : "1"),
            mae: new Decimal(isPaper ? 2 : 1),
            mfe: new Decimal(isPaper ? 0.5 : 2),
            tags: [isPaper ? "paperTag" : "realTag"],
        }),
    );
}

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

    it("leaves every real figure untouched when a paper fill lands", () => {
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

    it("computes every metric family from its own population alone", () => {
        const families: Array<{
            name: string;
            paper: () => unknown;
            real: () => unknown;
        }> = [
            { name: "performance", paper: () => journalState.paperPerformanceMetrics, real: () => journalState.performanceMetrics },
            { name: "quality", paper: () => journalState.paperQualityMetrics, real: () => journalState.qualityMetrics },
            { name: "execution", paper: () => journalState.paperExecutionMetrics, real: () => journalState.executionMetrics },
            { name: "risk", paper: () => journalState.paperRiskMetrics, real: () => journalState.riskMetrics },
            { name: "riskRadar", paper: () => journalState.paperRiskRadarMetrics, real: () => journalState.riskRadarMetrics },
            { name: "market", paper: () => journalState.paperMarketMetrics, real: () => journalState.marketMetrics },
            { name: "marketContext", paper: () => journalState.paperMarketContextMetrics, real: () => journalState.marketContextMetrics },
            { name: "asset", paper: () => journalState.paperAssetMetrics, real: () => journalState.assetMetrics },
            { name: "systemQuality", paper: () => journalState.paperSystemQualityMetrics, real: () => journalState.systemQualityMetrics },
            { name: "calendar", paper: () => journalState.paperCalendarMetrics, real: () => journalState.calendarMetrics },
            { name: "confluence", paper: () => journalState.paperConfluenceMetrics, real: () => journalState.confluenceMetrics },
            { name: "tag", paper: () => journalState.paperTagMetrics, real: () => journalState.tagMetrics },
            { name: "tagEvolution", paper: () => journalState.paperTagEvolutionMetrics, real: () => journalState.tagEvolutionMetrics },
            { name: "psychology", paper: () => journalState.paperPsychologyMetrics, real: () => journalState.psychologyMetrics },
        ];

        journalState.set(population(true));
        const paperAlone = families.map((family) => family.paper());
        journalState.set(population(false));
        const realAlone = families.map((family) => family.real());

        journalState.set([...population(false), ...population(true)]);
        families.forEach((family, i) => {
            // Non-vacuity: if the fixture ever goes silent for a family, the
            // leak checks below could not fail — this guard turns that into a
            // red test instead of a green illusion.
            expect(
                paperAlone[i],
                `${family.name}: fixture must let the two populations differ`,
            ).not.toEqual(realAlone[i]);
            expect(
                family.paper(),
                `${family.name}: a real fill leaked into the paper figures`,
            ).toEqual(paperAlone[i]);
            expect(
                family.real(),
                `${family.name}: a paper fill leaked into the real figures`,
            ).toEqual(realAlone[i]);
        });
    });
});
