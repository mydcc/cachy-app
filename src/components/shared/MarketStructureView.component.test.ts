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
 * FEAT-0679 — the market structure reference tab.
 *
 * Five cards in reading order from `academy.structure.*`, a static
 * language-neutral SVG schematic for the structure section, and lesson
 * buttons that ask the parent to switch tabs. The live charts are stubbed:
 * IndicatorLessonChart has its own suite, and this file is about sections,
 * diagram and navigation.
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

vi.mock("./IndicatorLessonChart.svelte", async () => ({
    default: (await import("../../tests/helpers/ChartPropSpy.svelte")).default,
}));

vi.mock("../../stores/market.svelte", async () => {
    const { marketState } = await import(
        "../../lib/windows/implementations/marketState.helper.svelte"
    );
    return { marketState };
});

import { tradeState } from "../../stores/trade.svelte";
import { marketState } from "../../lib/windows/implementations/marketState.helper.svelte";
import { normalizeSymbol } from "../../utils/symbolUtils";
import type { MarketData } from "../../stores/market/types";
import type { Kline } from "../../services/technicalsTypes";
import MarketStructureView from "./MarketStructureView.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

function renderView(props: Record<string, unknown> = {}): HTMLElement {
    component = mount(MarketStructureView, {
        target: host,
        props: { showLiveChart: false, onOpenIndicators: vi.fn(), ...props },
    }) as never;
    flushSync();
    return host.firstElementChild as HTMLElement;
}

describe("MarketStructureView", () => {
    it("renders all sections with their locale titles and takeaways", () => {
        const view = renderView();
        for (const section of ["s1", "s2", "s3", "s4a", "s4b"]) {
            const article = view.querySelector(`[data-testid="structure-${section}"]`);
            expect(article, `section ${section} missing`).not.toBeNull();
            expect(article?.textContent).toContain(lookup(`academy.structure.${section}.title`));
            expect(article?.textContent).toContain(lookup(`academy.structure.${section}.takeaway`));
            expect(article?.textContent).toContain(lookup(`academy.structure.${section}.body`));
        }
    });

    it("draws the static structure diagram with its legend", () => {
        const view = renderView();
        const diagram = view.querySelector('[data-testid="structure-diagram"]');
        expect(diagram, "structure diagram missing").not.toBeNull();
        for (const key of ["legendSwings", "legendBos", "legendChoch", "legendZone"]) {
            expect(view.textContent).toContain(lookup(`academy.structure.s2.${key}`));
        }
    });

    it("asks the parent to open the indicators tab per lesson button", () => {
        const onOpenIndicators = vi.fn();
        const view = renderView({ onOpenIndicators });
        for (const id of ["ema", "adx", "choppiness", "bollinger", "atr"]) {
            const button = view.querySelector(`[data-testid="structure-open-${id}"]`);
            expect(button, `button for ${id} missing`).not.toBeNull();
            (button as HTMLElement).click();
            flushSync();
            expect(onOpenIndicators).toHaveBeenLastCalledWith(id);
        }
        expect(onOpenIndicators).toHaveBeenCalledTimes(5);
    });

    it("mounts no live chart when showLiveChart is false, three when true", () => {
        const hidden = renderView({ showLiveChart: false });
        expect(hidden.querySelectorAll('[data-testid="empty-stub"]').length).toBe(0);
        // Offline and SEO readers get prose and the static diagram only: no
        // sentence may point at a chart that is not rendered.
        expect(hidden.textContent).not.toContain(lookup("academy.structure.s1.chartHint"));
        if (component) unmount(component);
        component = null;
        host.innerHTML = "";

        const shown = renderView({ showLiveChart: true });
        // One chart per demo entry: ema, ema, ema, adx, bollinger.
        expect(shown.querySelectorAll('[data-testid="empty-stub"]').length).toBe(5);
        expect(shown.textContent).toContain(lookup("academy.structure.s1.chartHint"));
    });

    it("passes integer-second markers and R/S price lines to the s2/s3 charts", () => {
        tradeState.symbol = "BTCUSDT";
        const key = normalizeSymbol("BTCUSDT", "bitunix");
        const at = (i: number, stepMs: number) => 1_700_000_000_000 + i * stepMs;
        const kline = (time: number, high: number, low: number, close: number): Kline =>
            ({ open: close, high, low, close, time }) as unknown as Kline;
        marketState.data[key] = {
            klines: {
                "1h": [
                    kline(at(0, 3_600_000), 100, 98, 99),
                    kline(at(1, 3_600_000), 102, 99, 101),
                    kline(at(2, 3_600_000), 110, 100, 108),
                    kline(at(3, 3_600_000), 105, 101, 104),
                    kline(at(4, 3_600_000), 104, 100, 103),
                    kline(at(5, 3_600_000), 100, 95, 97),
                    kline(at(6, 3_600_000), 98, 90, 93),
                    kline(at(7, 3_600_000), 99, 92, 96),
                    kline(at(8, 3_600_000), 101, 93, 99),
                    kline(at(9, 3_600_000), 103, 96, 100),
                    kline(at(10, 3_600_000), 106, 99, 104),
                    kline(at(11, 3_600_000), 108, 102, 112),
                ],
                "4h": [
                    kline(at(0, 14_400_000), 200, 190, 195),
                    kline(at(1, 14_400_000), 205, 192, 200),
                    kline(at(2, 14_400_000), 220, 195, 210),
                    kline(at(3, 14_400_000), 210, 198, 205),
                    kline(at(4, 14_400_000), 208, 196, 202),
                    kline(at(5, 14_400_000), 200, 180, 190),
                    kline(at(6, 14_400_000), 195, 182, 188),
                    kline(at(7, 14_400_000), 198, 185, 192),
                ],
            },
        } as unknown as MarketData;

        const view = renderView({ showLiveChart: true });
        const stubs = view.querySelectorAll('[data-testid="empty-stub"]');
        expect(stubs.length).toBe(5);

        // s2: one circle per swing (high and low alike) plus the BOS-up
        // arrow, all on integer seconds.
        const markers = JSON.parse(stubs[1].getAttribute("data-markers") ?? "null") as Array<{
            time: number;
            position: string;
            shape: string;
        }>;
        expect(markers.length).toBe(3);
        expect(markers[0]).toMatchObject({
            time: Math.floor(at(2, 3_600_000) / 1000),
            position: "aboveBar",
            shape: "circle",
        });
        expect(markers[1]).toMatchObject({
            time: Math.floor(at(6, 3_600_000) / 1000),
            position: "aboveBar",
            shape: "circle",
        });
        expect(markers[2]).toMatchObject({
            time: Math.floor(at(11, 3_600_000) / 1000),
            position: "belowBar",
            shape: "arrowUp",
        });
        for (const marker of markers) expect(Number.isInteger(marker.time)).toBe(true);

        // s3: nearest HTF resistance above and support below, titled R/S.
        const priceLines = JSON.parse(stubs[2].getAttribute("data-pricelines") ?? "null") as Array<{
            price: number;
            title: string;
        }>;
        expect(priceLines).toEqual([
            expect.objectContaining({ price: 220, title: "R" }),
            expect.objectContaining({ price: 180, title: "S" }),
        ]);

        // The s2 readout names the same break the markers show.
        expect(view.textContent).toContain(lookup("academy.structure.read.bosUp"));
    });
});
