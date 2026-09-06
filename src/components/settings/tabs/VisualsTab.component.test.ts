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
import VisualsTab from "./VisualsTab.svelte";
import { uiState } from "../../../stores/ui.svelte";
import { settingsState } from "../../../stores/settings.svelte";

const themes = [{ value: "dark", label: "Dark" }];

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function settle() {
    flushSync();
}

beforeEach(() => {
    uiState.settingsVisualsSubTab = "appearance";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    uiState.settingsVisualsSubTab = "appearance";
    settingsState.backgroundType = "none";
});

describe("VisualsTab — section split", () => {
    it("renders the appearance section by default", async () => {
        component = mount(VisualsTab, {
            target: host,
            props: { themes },
        }) as never;
        settle();

        expect(host.querySelector("#theme-select")).toBeTruthy();
        expect(host.querySelector("#font-select")).toBeTruthy();
    });

    it("renders the layout section on demand", async () => {
        component = mount(VisualsTab, {
            target: host,
            props: { themes },
        }) as never;
        settle();

        uiState.settingsVisualsSubTab = "layout";
        settle();

        expect(host.innerHTML).toContain("tab-visuals");
        // The news-behavior card is the only toggle-card block in the tab
        // (#2722 switched it from col-span-1 to col-span-full).
        expect(host.querySelector(".toggle-card")).toBeTruthy();
        expect(host.querySelector("#theme-select")).toBeNull();
    });

    it("renders the background section on demand", async () => {
        component = mount(VisualsTab, {
            target: host,
            props: { themes },
        }) as never;
        settle();

        uiState.settingsVisualsSubTab = "background";
        settingsState.backgroundType = "tradeflow";
        settle();

        // TradeFlow grid width slider lives in the background section.
        expect(host.querySelector("#tf-width")).toBeTruthy();
    });
});
