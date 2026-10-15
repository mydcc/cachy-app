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
 * FEAT-0677 — a refused line is surfaced, never silently dropped.
 *
 * `computeIndicatorSeries` can answer `supported: false` for a declared output.
 * A lesson that quietly drew one line fewer would teach a different indicator
 * than it names, so the chart shows the refusal and its reason. The engine path
 * is mocked here because a healthy build refuses nothing — the point is what the
 * UI does *when* it is told a line cannot be drawn, not whether the engine
 * refuses today.
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
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => ({
        addSeries: vi.fn(() => ({
            setData: vi.fn(),
            applyOptions: vi.fn(),
            attachPrimitive: vi.fn(),
            detachPrimitive: vi.fn(),
        })),
        removeSeries: vi.fn(),
        applyOptions: vi.fn(),
        remove: vi.fn(),
        subscribeCrosshairMove: vi.fn(),
        unsubscribeCrosshairMove: vi.fn(),
    })),
    createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn(), detach: vi.fn() })),
    ColorType: { Solid: 0 },
    CandlestickSeries: Symbol("candlestick"),
    LineSeries: Symbol("line"),
}));

vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn() },
}));

vi.mock("../../stores/market.svelte", async () => {
    const { marketState } = await import(
        "../../lib/windows/implementations/marketState.helper.svelte"
    );
    return { marketState };
});

const REFUSAL_REASON = "the engine does not compute bandwidth on this path";
vi.mock("../../lib/academy/indicatorLessonSeries", () => ({
    computeLessonSeries: () => ({
        lines: [{ name: "middle", values: ["100.5"] }],
        refused: [{ name: "bandwidth", reason: REFUSAL_REASON }],
    }),
}));

import { tradeState } from "../../stores/trade.svelte";
import { catalogueEntry } from "../../lib/alerts/indicatorCatalogue";
import IndicatorLessonChart from "./IndicatorLessonChart.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    tradeState.symbol = "BTCUSDT";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0677 — a refused line is shown, not silently dropped", () => {
    it("names the refused output and the engine's reason", () => {
        const entry = catalogueEntry("bollinger");
        if (!entry) throw new Error("no catalogue entry for bollinger");

        component = mount(IndicatorLessonChart, { target: host, props: { entry } }) as never;
        flushSync();

        const view = host.firstElementChild as HTMLElement;
        expect(view, `chart rendered nothing:\n${host.innerHTML}`).not.toBeNull();
        expect(view.textContent).toContain(lookup("indicatorLessons.chart.refusedHeading"));
        expect(view.textContent).toContain(
            lookup("dashboard.alerts.indicators.output.bandwidth"),
        );
        expect(view.textContent).toContain(REFUSAL_REASON);
    });
});
