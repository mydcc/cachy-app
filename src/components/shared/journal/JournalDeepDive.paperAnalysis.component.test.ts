// @vitest-environment happy-dom
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
 * FEAT-0692 — the deep dive follows the journal's Live/Paper/All filter.
 *
 * `paper` reads the simulated population and is marked as such, `live` and
 * `all` read the real one, and `all` says so. A mode whose population has no
 * closed trades yet gets a named empty state instead of blank axes.
 *
 * The chart wrappers are replaced by `ChartDataSpy`, which renders the props
 * a chart received as JSON: the assertions are about what fed the chart, not
 * about Chart.js — and what fed the chart is exactly what this item is. The
 * preset sweep is an equivalence check: adding the *other* population to the
 * journal must not change a single figure of the mode under test, preset by
 * preset. That pins the source of every chart — including the ones the
 * component computes itself (rolling, leakage) — without hard-coding
 * intermediate values.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";

import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

const settings = vi.hoisted(() => ({ journalPaperTrades: true }));
vi.mock("../../../stores/settings.svelte", () => ({
    settingsState: settings,
}));

vi.mock("../charts/LineChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/BarChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/DoughnutChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/BubbleChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/ScatterChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/RadarChart.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));
vi.mock("../charts/CalendarHeatmap.svelte", async () => ({
    default: (await import("../../../tests/helpers/ChartDataSpy.svelte"))
        .default,
}));

import { journalState } from "../../../stores/journal.svelte";
import type { JournalEntry } from "../../../stores/types";
import JournalDeepDive from "./JournalDeepDive.svelte";

const THEME = {
    success: "#22c55e",
    danger: "#ef4444",
    warning: "#f59e0b",
    accent: "#3b82f6",
    textSecondary: "#94a3b8",
};

type TradeMode = "live" | "paper" | "all";

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

/**
 * A full population with enough closed trades and enough per-trade context
 * (risk, ATR, MFE/MAE, tags) that every preset has something to render —
 * otherwise the sweep would compare two silences. 30 is the smallest sample
 * the SQN family accepts.
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

interface SpyChart {
    title?: string;
    labels?: unknown[];
    datasets?: Array<{ data?: unknown[] }>;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
    journalState.set([]);
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    unmountView();
    host.remove();
});

function unmountView() {
    if (component) unmount(component);
    component = null;
    host.innerHTML = "";
}

function render(tradeMode: TradeMode): HTMLElement {
    component = mount(JournalDeepDive, {
        target: host,
        props: { themeColors: THEME, tradeMode },
    });
    flushSync();
    return host;
}

function chartSpies(el: HTMLElement): HTMLElement[] {
    return Array.from(
        el.querySelectorAll<HTMLElement>('[data-testid="chart-data-spy"]'),
    );
}

/** The data each stubbed chart received, in render order. */
function charts(el: HTMLElement): SpyChart[] {
    return chartSpies(el).map((spy) => ({
        title: spy.getAttribute("data-title") ?? "",
        ...(JSON.parse(spy.getAttribute("data-json") ?? "null") as SpyChart),
    }));
}

function chartByTitle(el: HTMLElement, titleKey: string): SpyChart | undefined {
    return charts(el).find((chart) => chart.title === lookup(titleKey));
}

function clickPreset(el: HTMLElement, label: string) {
    const button = Array.from(el.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
    );
    expect(button, `preset button "${label}" missing`).toBeDefined();
    (button as HTMLButtonElement).click();
    flushSync();
}

const PRESETS: Array<[string, string]> = [
    ["performance", "journal.deepDive.performance"],
    ["execution", "journal.deepDive.execution"],
    ["risk", "journal.deepDive.risk"],
    ["market", "journal.deepDive.market"],
    ["leakage", "journal.deepDive.leakage"],
    ["time", "journal.deepDive.time"],
    ["strategies", "journal.deepDive.strategies"],
    ["behavior", "journal.deepDive.behavior"],
    ["quality", "journal.deepDive.systemQuality"],
    // `forecast` is deliberately absent: its cone is resampled with
    // Math.random on every render, so two renders cannot be compared. Its
    // input is the same mode-selected `journal` array that feeds rolling and
    // leakage, and those two the sweep does pin.
];

/** Every preset's charts, in render order, for the given mode. */
function chartsByPreset(tradeMode: TradeMode): Record<string, SpyChart[]> {
    const el = render(tradeMode);
    const snapshot: Record<string, SpyChart[]> = {};
    for (const [id, labelKey] of PRESETS) {
        if (id !== "performance") clickPreset(el, lookup(labelKey));
        snapshot[id] = charts(el);
    }
    return snapshot;
}

describe("JournalDeepDive — paper analysis (FEAT-0692)", () => {
    it("draws the paper run from paper entries alone in paper mode", () => {
        journalState.set([entry("r1", "-30"), entry("p1", "-40", true)]);

        const drawdown = chartByTitle(
            render("paper"),
            "journal.deepDive.charts.titles.drawdown",
        );

        expect(drawdown).toBeDefined();
        expect(drawdown?.datasets?.[0]?.data).toEqual([-40]);
    });

    it("draws the real run from real entries alone in live mode", () => {
        journalState.set([entry("r1", "-30"), entry("p1", "-40", true)]);

        const drawdown = chartByTitle(
            render("live"),
            "journal.deepDive.charts.titles.drawdown",
        );

        expect(drawdown).toBeDefined();
        expect(drawdown?.datasets?.[0]?.data).toEqual([-30]);
    });

    it.each(["paper", "live"] as const)(
        "changes no %s preset when the other population joins",
        (mode) => {
            const other = population(mode !== "paper");
            const own = population(mode === "paper");

            journalState.set([...other, ...own]);
            const withBoth = chartsByPreset(mode);
            unmountView();

            journalState.set(own);
            const ownOnly = chartsByPreset(mode);

            for (const [id] of PRESETS) {
                // Non-vacuity: a preset that renders nothing in both runs
                // could not fail this comparison.
                expect(
                    withBoth[id].length,
                    `preset ${id} should render charts for this fixture`,
                ).toBeGreaterThan(0);
                expect(
                    withBoth[id],
                    `preset ${id} changed when the other population joined`,
                ).toEqual(ownOnly[id]);
            }
        },
    );

    it("marks the paper run as simulated", () => {
        journalState.set([entry("p1", "-40", true)]);

        const banner = render("paper").querySelector(
            '[data-testid="deepdive-mode-banner"]',
        );

        expect(banner).not.toBeNull();
        expect(banner?.textContent).toContain(
            lookup("journal.deepDive.simBadge"),
        );
        expect(banner?.textContent).toContain(
            lookup("journal.deepDive.paperBanner"),
        );
    });

    it("renders all mode as real data plus a hint that paper stays out", () => {
        journalState.set([entry("r1", "-30"), entry("p1", "-40", true)]);

        const el = render("all");

        expect(
            el.querySelector('[data-testid="deepdive-mode-banner"]')
                ?.textContent,
        ).toContain(lookup("journal.deepDive.allModeHint"));
        expect(
            chartByTitle(el, "journal.deepDive.charts.titles.drawdown")
                ?.datasets?.[0]?.data,
        ).toEqual([-30]);
    });

    it("does not stack the all-mode hint on top of the empty state", () => {
        journalState.set([entry("p1", "-40", true)]);

        const el = render("all");

        expect(
            el.querySelector('[data-testid="deepdive-mode-banner"]'),
        ).toBeNull();
        expect(
            el.querySelector('[data-testid="deepdive-empty-state"]')
                ?.textContent,
        ).toContain(lookup("journal.deepDive.realOnlyHint"));
    });

    it("carries no banner in live mode", () => {
        journalState.set([entry("r1", "-30")]);

        const el = render("live");

        expect(
            el.querySelector('[data-testid="deepdive-mode-banner"]'),
        ).toBeNull();
    });

    it("names the empty state when the paper run has no closed trades yet", () => {
        journalState.set([entry("r1", "-30")]);

        const el = render("paper");

        expect(
            el.querySelector('[data-testid="deepdive-empty-state"]')
                ?.textContent,
        ).toContain(lookup("journal.deepDive.paperEmpty"));
        expect(chartSpies(el)).toHaveLength(0);
    });

    it("sends a real-only view with paper trades to the journal list", () => {
        journalState.set([entry("p1", "-40", true)]);

        const el = render("live");

        expect(
            el.querySelector('[data-testid="deepdive-empty-state"]')
                ?.textContent,
        ).toContain(lookup("journal.deepDive.realOnlyHint"));
    });

    it("says there is nothing to analyse for an empty journal", () => {
        const el = render("live");

        expect(
            el.querySelector('[data-testid="deepdive-empty-state"]')
                ?.textContent,
        ).toContain(lookup("journal.deepDive.noTrades"));
    });

    it("feeds the six-segment split from the paper population in paper mode", () => {
        journalState.set([entry("p1", "-40", true)]);

        const el = render("paper");
        clickPreset(el, lookup("journal.deepDive.execution"));

        const sixSegment = chartByTitle(
            el,
            "journal.deepDive.charts.titles.sixSegment",
        );
        // One losing long paper trade: the loss-long bucket alone.
        expect(sixSegment).toBeDefined();
        expect(sixSegment?.datasets?.[0]?.data).toEqual([0, 0, 1, 0, 0, 0]);
    });
});
