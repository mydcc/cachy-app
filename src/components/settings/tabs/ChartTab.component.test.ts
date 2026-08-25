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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import ChartTab from "./ChartTab.svelte";
import { settingsState } from "../../../stores/settings.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function settle() {
    flushSync();
}

beforeEach(() => {
    settingsState.resetChartSettings();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    settingsState.resetChartSettings();
});

describe("ChartTab — reset button", () => {
    it("restores every chart field to its default on click", async () => {
        // Move fields away from their defaults first.
        settingsState.chartPriceScaleMode = "linear";
        settingsState.chartInvertScale = true;
        settingsState.chartFixedDecimals = 7;
        settingsState.chartShowGrid = false;
        settingsState.chartWatermark = true;
        settingsState.chartCountdownEnabled = true;

        component = mount(ChartTab, { target: host }) as never;
        settle();

        const resetButton = host.querySelector(
            "button",
        ) as HTMLButtonElement | null;
        expect(resetButton).toBeTruthy();

        resetButton!.click();
        settle();

        expect(settingsState.chartPriceScaleMode).toBe("log");
        expect(settingsState.chartInvertScale).toBe(false);
        expect(settingsState.chartFixedDecimals).toBe(2);
        expect(settingsState.chartShowGrid).toBe(true);
        expect(settingsState.chartWatermark).toBe(false);
        expect(settingsState.chartCountdownEnabled).toBe(false);
    });

    it("renders only Linear and Logarithmic as scale modes", () => {
        component = mount(ChartTab, { target: host }) as never;
        settle();

        const select = host.querySelector(
            "#chart-scale-mode",
        ) as HTMLSelectElement | null;
        expect(select).toBeTruthy();
        const values = [...select!.options].map((o) => o.value);
        expect(values).toEqual(["linear", "log"]);
    });

    it("no longer renders a left price scale toggle", () => {
        component = mount(ChartTab, { target: host }) as never;
        settle();

        // The removed setting must not surface anywhere in the tab markup.
        expect(host.innerHTML).not.toContain("leftScale");
        // The store field itself is gone from the type — binding it would be
        // a compile error, so presence of any leftover toggle is impossible.
        expect("chartShowLeftScale" in settingsState).toBe(false);
    });
});
