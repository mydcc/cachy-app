// @vitest-environment happy-dom
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

/*
 * FEAT-0684 — the Technicals panel's timeframe chip, through the dropdown it now
 * shares with the Academy lesson.
 *
 * This is the panel's first test, and it exists because the chip's markup moved
 * into `TimeframeDropdown`: without a mount, the panel could lose its chip
 * entirely — or stop writing the pick to `tradeState.analysisTimeframe`, which
 * is the panel's own half of the contract — and every other suite would stay
 * green, because no other suite mounts this component.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, string | number> }) => {
                const template = lookup(key) ?? key;
                if (!options?.values) return template;
                return template.replace(/\{(\w+)\}/g, (_, name) =>
                    String(options.values?.[name] ?? ""),
                );
            },
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

/* The panel registers a market subscription; the shared control does not need it. */
vi.mock("../../services/activeTechnicalsManager.svelte", () => ({
    activeTechnicalsManager: { register: vi.fn(), unregister: vi.fn() },
}));

/* The panel opens a bias-timeframe channel; the mock keeps the network out. */
vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: {
        register: vi.fn(),
        unregister: vi.fn(),
        ensureHistory: vi.fn(() => Promise.resolve(true)),
    },
}));

import TechnicalsPanel from "./TechnicalsPanel.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { settingsState } from "../../stores/settings.svelte";
import { indicatorState } from "../../stores/indicator.svelte";
import { marketState } from "../../stores/market.svelte";
import type { Kline, TechnicalsData } from "../../services/technicalsTypes";
import { Decimal } from "decimal.js";
import type { MarketData } from "../../stores/market/types";
import { marketWatcher } from "../../services/marketWatcher";
import { LESSON_HISTORY_TARGET } from "../../lib/academy/lessonSettings";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let previousVisibility: boolean;
let previousTimeframe: string;

function renderPanel(): HTMLElement {
    if (component) {
        unmount(component as never);
        component = null;
    }
    host.innerHTML = "";

    component = mount(TechnicalsPanel, {
        target: host,
        props: { isVisible: true },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `the panel rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

beforeEach(() => {
    previousVisibility = settingsState.showTechnicals;
    previousTimeframe = tradeState.analysisTimeframe;
    settingsState.showTechnicals = true;
    tradeState.update((state) => ({ ...state, analysisTimeframe: "1h" }));

    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
    settingsState.showTechnicals = previousVisibility;
    tradeState.update((state) => ({ ...state, analysisTimeframe: previousTimeframe }));
});

describe("FEAT-0684 — the panel's timeframe chip", () => {
    it("shows the analysis timeframe and writes the one that is picked", () => {
        const view = renderPanel();

        const chip = view.querySelector<HTMLButtonElement>(
            `[aria-label^="${lookup("common.timeframe")}"]`,
        );
        expect(chip, "the panel rendered no timeframe chip").not.toBeNull();
        expect(chip?.textContent?.trim()).toBe("1h");

        chip?.click();
        flushSync();

        const pick = [...view.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "4h",
        );
        if (!pick) throw new Error("no 4h quick pick in the panel's popup");
        pick.click();
        flushSync();

        // The panel's own half: a pick is the analysis timeframe, not a local
        // value. The chip follows it.
        expect(tradeState.analysisTimeframe).toBe("4h");
        expect(
            renderPanel()
                .querySelector<HTMLButtonElement>(`[aria-label^="${lookup("common.timeframe")}"]`)
                ?.textContent?.trim(),
        ).toBe("4h");
    });
});

/*
 * FEAT-0766 — the market-context check.
 *
 * The five rows are a reading, not a measurement list: the order, the bias
 * timeframe and the threshold inline are the contract. The fixture is the same
 * deterministic path the structure-read suite uses, so the last break is a
 * known event at a known bar and the row can be asserted by name and distance
 * instead of by "something was rendered".
 */
const CONTEXT_CLOSES = [
    100, 101, 102, 103, 104, 105, 106, 105, 104, 103, 102, 101, 102, 103, 104, 105, 106, 107, 108,
    109, 110, 111, 112, 108, 106, 107, 108, 107, 105, 107, 110, 112, 114, 116, 118, 117, 118, 116,
    114, 112, 110, 108, 106, 104, 102, 100, 98, 96, 94, 92, 90, 88, 89, 90, 91, 92, 93, 94, 92, 91,
    90, 89,
];

/*
 * The bias timeframe gets its own path, so a swap between `analysisBars` and
 * `biasBars` cannot stay green: the 4h swing high sits at 196 and the swing low
 * at 144, while the 1h fixture trades in the 80-120 range.
 */
const BIAS_CLOSES = [
    ...Array.from({ length: 20 }, (_, i) => 100 + i * 5),
    ...Array.from({ length: 10 }, (_, i) => 195 - (i + 1) * 5),
    ...Array.from({ length: 10 }, (_, i) => 145 + (i + 1) * 4),
];

function biasKlines(): Kline[] {
    return BIAS_CLOSES.map((close, i) => ({
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 0,
        time: 1_600_000_000_000 + i * 14_400_000,
    })) as unknown as Kline[];
}

function contextKlines(): Kline[] {
    return CONTEXT_CLOSES.map((close, i) => ({
        open: close,
        high: i === 36 ? 124 : close + 0.5,
        low: close - 0.5,
        close,
        volume: 0,
        time: 1_700_000_000_000 + i * 3_600_000,
    })) as unknown as Kline[];
}

function contextTechnicals(): TechnicalsData {
    return {
        oscillators: [],
        movingAverages: [],
        summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
        volatility: {
            atr: 336.608,
            bb: { upper: 101, middle: 100, lower: 99, percentP: 0.5 },
        },
        advanced: {
            adx: { value: 16.8, pdi: 10, mdi: 12, trend: "Neutral", dir: "down" },
            choppiness: { value: 57.8, state: "Range" },
        },
    };
}

function seedMarket(withKlines = true): void {
    tradeState.update((state) => ({ ...state, symbol: "BTCUSDT" }));
    marketState.data["BTCUSDT"] = {
        klines: withKlines ? { "1h": contextKlines(), "4h": biasKlines() } : {},
        klinesLastUpdated: {},
        technicals: { "1h": contextTechnicals() },
    } as unknown as MarketData;
}

function rowText(view: HTMLElement, testId: string): string {
    const row = view.querySelector(`[data-testid="${testId}"]`);
    expect(row, `row ${testId} missing`).not.toBeNull();
    return (row!.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("FEAT-0766 — the market-context check", () => {
    let previousSymbol: string;

    beforeEach(() => {
        previousSymbol = tradeState.symbol;
        indicatorState.panelSections.context = true;
    });

    afterEach(() => {
        indicatorState.panelSections.context = true;
        tradeState.update((state) => ({ ...state, symbol: previousSymbol }));
        delete (marketState.data as Record<string, unknown>)["BTCUSDT"];
    });

    it("reads bias, structure and levels in that order", () => {
        seedMarket();
        const view = renderPanel();

        const block = view.querySelector('[data-testid="technicals-context"]');
        expect(block, "the panel rendered no context block").not.toBeNull();
        // The bias timeframe is one step above the 1h analysis timeframe.
        expect(block!.textContent).toContain("4h");

        const order = [...block!.querySelectorAll("[data-testid^='context-']")].map((row) =>
            row.getAttribute("data-testid"),
        );
        expect(order).toEqual([
            "context-bias",
            "context-structure",
            "context-resistance",
            "context-support",
        ]);
    });

    it("names the last break and its distance in candles", () => {
        seedMarket();
        const view = renderPanel();

        // The fixture flips the structure at bar 43 of 62; nothing follows it.
        // The row names its own timeframe, because it is not the bias one.
        // On screen the direction is a glyph, so the distance cannot be split
        // from its number by a long word; a screen reader gets the phrase.
        expect(rowText(view, "context-structure")).toContain("1h");
        expect(rowText(view, "structure-value")).toBe("CHoCH ↓ · 18 candles");
        expect(rowText(view, "structure-label")).toBe(
            `${lookup("technicals.context.chochDown")} · 18 candles`,
        );
        expect(
            view.querySelector('[data-testid="structure-value"]')!.querySelector(".whitespace-nowrap")
                ?.textContent,
        ).toBe("18 candles");
    });

    it("does not repeat the values the panel already prints above", () => {
        seedMarket();
        const view = renderPanel();

        /*
         * ADX, Choppiness and volatility are already rendered in their own
         * sections, with more context than a bare number (trend/state, DI+ and
         * DI-). A second row here would show one measurement twice and imply a
         * second one exists — the duplication the context block must not add.
         */
        for (const row of ["context-adx", "context-chop", "context-volatility"]) {
            expect(view.querySelector(`[data-testid="${row}"]`), row).toBeNull();
        }
        // The numbers themselves are still on screen, once, where they belong.
        const panel = view.textContent ?? "";
        expect(panel).toContain(lookup("settings.technicals.adx"));
        expect(panel).toContain(lookup("settings.technicals.choppiness"));
        expect(panel).toContain(lookup("settings.technicals.bbWidth"));
    });

    it("takes the levels from the bias timeframe, not the analysis one", () => {
        seedMarket();
        const view = renderPanel();

        // 196 / 144 are the 4h swings; the 1h fixture never trades near them.
        expect(rowText(view, "context-resistance")).toBe("Resistance 4h 196.0000");
        expect(rowText(view, "context-support")).toBe("Support 4h 144.0000");
    });

    it("registers the bias channel and releases it on unmount", () => {
        seedMarket();
        renderPanel();

        const watcher = vi.mocked(marketWatcher);
        expect(watcher.ensureHistory).toHaveBeenCalledWith("BTCUSDT", "4h", LESSON_HISTORY_TARGET);
        expect(watcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "chart");

        unmount(component as never);
        component = null;
        expect(watcher.unregister).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "chart");
    });

    it("falls back to a dash without candles", () => {
        seedMarket(false);
        const view = renderPanel();

        expect(rowText(view, "context-bias")).toContain("—");
        expect(rowText(view, "context-structure")).toContain(lookup("technicals.context.noBreak"));
        expect(rowText(view, "context-resistance")).toContain("—");
        expect(rowText(view, "context-support")).toContain("—");
    });

    it("sits directly above the signal list, with the summary still first", () => {
        seedMarket();
        const view = renderPanel();

        const block = view.querySelector('[data-testid="technicals-context"]')!;
        const list = block.parentElement!;
        // The block reads the signal list, so it comes first: the heading of the
        // very next section is the signals title.
        expect(block.nextElementSibling?.firstElementChild?.textContent?.trim()).toBe(
            lookup("settings.workspace.signals"),
        );
        // The summary keeps the first position, which is why the block left it.
        expect(list.firstElementChild?.textContent).toContain(
            lookup("settings.technicals.summaryAction"),
        );
    });

    it("disappears when the section is switched off", () => {
        seedMarket();
        indicatorState.panelSections.context = false;
        const view = renderPanel();

        expect(view.querySelector('[data-testid="technicals-context"]')).toBeNull();
    });
});

/*
 * FEAT-0797 — pivot explainability.
 *
 * The panel printed R3…S3 as bare numbers. A pivot level is a formula applied
 * to the *previous closed candle*, so without that candle, the formula and the
 * selected type the number cannot be checked against the chart — which is the
 * report this block answers. The fixture pins the basis candle to a known bar,
 * so the row can be asserted by value instead of by "something rendered".
 */
const PIVOT_BASIS_TIME = 1_700_000_000_000 + 62 * 3_600_000;

function pivotKlines(): Kline[] {
    const bars = contextKlines();
    // Second-to-last = the closed basis candle, last = the forming one. Built
    // with real `Decimal`s: a fixture that only satisfies the type through a
    // cast would stop exercising `Number(kline.high)` in the panel.
    bars.push({
        open: new Decimal(100.1),
        high: new Decimal(100.4),
        low: new Decimal(100.0),
        close: new Decimal(100.3),
        volume: new Decimal(0),
        time: PIVOT_BASIS_TIME,
    });
    bars.push({
        open: new Decimal(100.3),
        high: new Decimal(100.5),
        low: new Decimal(100.2),
        close: new Decimal(100.4),
        volume: new Decimal(0),
        time: PIVOT_BASIS_TIME + 3_600_000,
    });
    return bars;
}

function pivotTechnicals(): TechnicalsData {
    return {
        ...contextTechnicals(),
        pivots: {
            classic: {
                p: 100.2333,
                r1: 100.4667,
                r2: 100.6333,
                r3: 100.8667,
                s1: 100.0667,
                s2: 99.8333,
                s3: 99.6667,
            },
        },
        pivotBasis: { high: 100.4, low: 100.0, close: 100.3, open: 100.1 },
    };
}

function seedPivotMarket(): void {
    seedMarket();
    marketState.data["BTCUSDT"].klines["1h"] = pivotKlines();
    marketState.data["BTCUSDT"].technicals["1h"] = pivotTechnicals();
}

describe("FEAT-0797 — pivot explainability", () => {
    let previousSymbol: string;
    let previousType: typeof indicatorState.pivots.type;
    let previousTooltips: boolean;

    beforeEach(() => {
        previousSymbol = tradeState.symbol;
        previousType = indicatorState.pivots.type;
        previousTooltips = settingsState.showTooltips;
        indicatorState.pivots.type = "classic";
        indicatorState.panelSections.pivots = true;
        // The formula lives behind the help marker, and the marker only exists
        // while help is switched on.
        settingsState.showTooltips = true;
    });

    afterEach(() => {
        indicatorState.pivots.type = previousType;
        indicatorState.panelSections.pivots = true;
        settingsState.showTooltips = previousTooltips;
        tradeState.update((state) => ({ ...state, symbol: previousSymbol }));
        delete (marketState.data as Record<string, unknown>)["BTCUSDT"];
    });

    it("names the pivot type and the timeframe it was computed on", () => {
        seedPivotMarket();
        const view = renderPanel();

        // The heading is the section; the chip is the reading, and it is
        // asserted in full so a swap of type and timeframe cannot stay green.
        expect(rowText(view, "pivot-header")).toContain(
            lookup("settings.technicals.pivotsTitle"),
        );
        expect(rowText(view, "pivot-type")).toBe(
            `${lookup("settings.technicals.pivotClassic")} · 1h`,
        );
    });

    it("shows the candle the levels were derived from", () => {
        seedPivotMarket();
        const basis = rowText(renderPanel(), "pivot-basis");

        // H, L and C come from `pivotBasis` — the values the calculator used,
        // not a second read of the series.
        expect(basis).toContain(lookup("technicals.pivots.basis"));
        expect(basis).toContain("100.4000");
        expect(basis).toContain("100.0000");
        expect(basis).toContain("100.3000");
        expect(basis).toMatch(/\d{1,2}:\d{2}/);
    });

    it("puts the formula behind a marker instead of padding the panel", () => {
        seedPivotMarket();
        const chip = renderPanel().querySelector<HTMLElement>('[data-testid="pivot-type"]')!;

        const marker = chip.querySelector<HTMLElement>(".info-tip");
        expect(marker, "the pivot header rendered no help marker").not.toBeNull();
        expect(marker!.getAttribute("aria-label")).toContain("(H+L+C)/3");
        // Help, not data: the formula is not part of the visible row.
        expect(chip.textContent).not.toContain("(H+L+C)/3");
    });

    it("follows the selected pivot type", () => {
        seedPivotMarket();
        indicatorState.pivots.type = "fibonacci";
        const chip = renderPanel().querySelector<HTMLElement>('[data-testid="pivot-type"]')!;

        expect(chip.textContent).toContain(lookup("settings.technicals.pivotFibonacci"));
        expect(chip.querySelector(".info-tip")?.getAttribute("aria-label")).toContain("0.382");
    });

    it("drops the time instead of labelling the levels with the wrong candle", () => {
        seedPivotMarket();
        // The series no longer contains the candle the levels were built from
        // (a stale render between a new candle and the next calculation).
        marketState.data["BTCUSDT"].klines["1h"] = contextKlines();
        const basis = rowText(renderPanel(), "pivot-basis");

        // The basis values stay authoritative …
        expect(basis).toContain("100.4000");
        // … and the row refuses to invent a timestamp for them.
        expect(basis).not.toMatch(/\d{1,2}:\d{2}/);
    });
});
