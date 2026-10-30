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
 * FEAT-0346 — VisualsLayout wires the visuals settings to their stores. Each
 * control must write the store it is bound to; the component owns no state of
 * its own to drift from.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

const settingsMock = vi.hoisted(() => ({
    newsOpenBehavior: "smart",
    showSidebars: false,
    enableDockingCentered: true,
    dockingPosition: "top",
    focusFollowsMouse: false,
}));
vi.mock("../../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

const uiMock = vi.hoisted(() => ({ showAssistant: false, toggleAssistant: vi.fn() }));
vi.mock("../../../stores/ui.svelte", () => ({ uiState: uiMock }));

import VisualsLayout from "./VisualsLayout.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.newsOpenBehavior = "smart";
    settingsMock.showSidebars = false;
    settingsMock.enableDockingCentered = true;
    settingsMock.dockingPosition = "top";
    settingsMock.focusFollowsMouse = false;
    uiMock.showAssistant = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(VisualsLayout, { target: host }) as never;
    flushSync();
}

function buttonContaining(text: string): HTMLButtonElement {
    const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes(text),
    );
    if (!el) throw new Error(`button containing "${text}" not rendered`);
    return el;
}

describe("FEAT-0346 — VisualsLayout writes through to the stores", () => {
    it("records the chosen news open behaviour", () => {
        render();

        buttonContaining(lookup("settings.newsOpenBehaviorNewTab")).click();

        expect(settingsMock.newsOpenBehavior).toBe("new_tab");
    });

    it("renders the news open behaviour under its own group heading", () => {
        render();

        const heading = [...host.querySelectorAll("h4")].find(
            (h) => h.textContent?.trim() === lookup("settings.newsArticlesTitle"),
        );
        if (!heading) throw new Error("news article display heading not rendered");

        const group = heading.closest("div");
        if (!group) throw new Error("heading has no group container");

        expect(group.className).toContain("border-t");
        for (const key of [
            "settings.newsOpenBehaviorSmart",
            "settings.newsOpenBehaviorReader",
            "settings.newsOpenBehaviorNewTab",
            "settings.newsOpenBehaviorWindow",
        ]) {
            expect(
                group.contains(buttonContaining(lookup(key))),
                `${key} is outside the news group`,
            ).toBe(true);
        }
    });

    it("binds the sidebars toggle to the settings store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();

        expect(settingsMock.showSidebars).toBe(true);
    });

    it("routes the assistant toggle through the ui store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();

        expect(uiMock.toggleAssistant).toHaveBeenCalledWith(true);
    });

    it("renders the docking controls and binds the centered toggle", () => {
        render();

        const centered = host.querySelector<HTMLInputElement>("#docking-centered");
        if (!centered) throw new Error("docking centered toggle not rendered");
        centered.click();
        expect(settingsMock.enableDockingCentered).toBe(false);

        const select = host.querySelector<HTMLSelectElement>("#docking-position");
        if (!select) throw new Error("docking position select not rendered");
        // happy-dom does not resolve :checked for options, so Svelte's select
        // write-through cannot be exercised here; the option set is what a
        // component test can pin without a real browser.
        expect([...select.options].map((option) => option.value)).toEqual([
            "top",
            "bottom",
        ]);
    });

    it("binds the focus-follows-mouse toggle", () => {
        render();

        const focus = host.querySelector<HTMLInputElement>(
            "#focus-follows-mouse",
        );
        if (!focus) throw new Error("focus-follows toggle not rendered");
        focus.click();
        expect(settingsMock.focusFollowsMouse).toBe(true);
    });
});
