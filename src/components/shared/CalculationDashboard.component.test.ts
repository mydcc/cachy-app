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
 * FEAT-0346 — CalculationDashboard is the diagnostics surface: it reports how
 * full the analysis cache is and how hard the app is working. The tests pin the
 * derived values (health, profile, memory) and the empty state, so a wrong
 * threshold shows up here instead of in production.
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
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

const settingsMock = vi.hoisted(() => ({
    marketAnalysisInterval: 60,
    marketCacheSize: 10,
    analyzeAllFavorites: false,
    favoriteSymbols: [] as string[],
    pauseAnalysisOnBlur: true,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

const analysisMock = vi.hoisted(() => ({
    results: {} as Record<string, { updatedAt?: number; confluenceScore?: number; condition?: string }>,
    lastAnalysisTime: 0,
    isAnalyzing: false,
}));
vi.mock("../../stores/analysis.svelte", () => ({ analysisState: analysisMock }));

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

import CalculationDashboard from "./CalculationDashboard.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    settingsMock.marketAnalysisInterval = 60;
    settingsMock.marketCacheSize = 10;
    settingsMock.analyzeAllFavorites = false;
    settingsMock.favoriteSymbols = [];
    settingsMock.pauseAnalysisOnBlur = true;
    analysisMock.results = {};
    analysisMock.lastAnalysisTime = 0;
    analysisMock.isAnalyzing = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(CalculationDashboard, { target: host }) as never;
    flushSync();
}

function withResults(count: number) {
    const now = Date.now();
    const result: Record<string, { updatedAt: number; confluenceScore: number; condition: string }> = {};
    for (let i = 0; i < count; i++) {
        result[`SYM${i}USDT`] = { updatedAt: now, confluenceScore: 40 + i, condition: "trending" };
    }
    analysisMock.results = result;
}

describe("FEAT-0346 — CalculationDashboard reports the state it derived", () => {
    it("says so when nothing has been analysed yet", () => {
        render();

        expect(host.textContent).toContain(lookup("calculationDashboard.noSymbols"));
        expect(host.textContent).toContain("0 / 10");
        expect(host.textContent).toContain("0.1 MB");
    });

    it("lists a tracked symbol with its score and condition", () => {
        withResults(1);
        render();

        expect(host.textContent).toContain("SYM0USDT");
        expect(host.textContent).toContain("40%");
        expect(host.textContent).toContain("trending");
    });

    it("calls a nearly full cache critical and warns about it", () => {
        withResults(10);
        render();

        expect(host.textContent).toContain(lookup("calculationDashboard.critical"));
        expect(host.textContent).toContain("10 / 10");
    });

    it("shows the eight most recently updated symbols first", () => {
        const now = Date.now();
        const result: Record<string, { updatedAt: number; confluenceScore: number; condition: string }> = {};
        for (let i = 0; i < 10; i++) {
            // SYM9 is newest, SYM0 is oldest — insertion order is oldest-first
            // so slicing before sorting would drop the two newest symbols.
            result[`SYM${i}USDT`] = { updatedAt: now - (9 - i) * 1000, confluenceScore: 40 + i, condition: "trending" };
        }
        analysisMock.results = result;
        render();

        const names = [...host.querySelectorAll(".symbol-name")].map((el) => el.textContent);
        expect(names).toEqual([
            "SYM9USDT",
            "SYM8USDT",
            "SYM7USDT",
            "SYM6USDT",
            "SYM5USDT",
            "SYM4USDT",
            "SYM3USDT",
            "SYM2USDT",
        ]);
    });

    it("names the light profile for a 300s interval", () => {
        settingsMock.marketAnalysisInterval = 300;
        render();

        expect(host.textContent).toContain(lookup("calculationDashboard.profileLight"));
    });

    it("names the pro profile for a 10s interval", () => {
        settingsMock.marketAnalysisInterval = 10;
        render();

        expect(host.textContent).toContain(lookup("calculationDashboard.profilePro"));
    });
});
