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

    it("reads bias, structure, levels, regime and volatility in that order", () => {
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
            "context-adx",
            "context-chop",
            "context-volatility",
        ]);
    });

    it("names the last break and its distance in candles", () => {
        seedMarket();
        const view = renderPanel();

        // The fixture flips the structure at bar 43 of 62; nothing follows it.
        // The row names its own timeframe, because it is not the bias one.
        expect(rowText(view, "context-structure")).toBe(
            `Structure 1h ${lookup("technicals.context.chochDown")} · 18 candles`,
        );
    });

    it("carries the ADX threshold inline", () => {
        seedMarket();
        const view = renderPanel();

        expect(rowText(view, "context-adx")).toBe("ADX 1h 16.8 < 25");
        expect(rowText(view, "context-chop")).toBe("Chop 1h 57.8 (38.2–61.8)");
        expect(rowText(view, "context-volatility")).toBe("Volatility 1h BW 2.00 % · ATR 336.61");
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

    it("disappears when the section is switched off", () => {
        seedMarket();
        indicatorState.panelSections.context = false;
        const view = renderPanel();

        expect(view.querySelector('[data-testid="technicals-context"]')).toBeNull();
    });
});
