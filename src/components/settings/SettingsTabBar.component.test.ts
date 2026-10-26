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

/**
 * FEAT-0735 -- the settings rail.
 *
 * The rail used to be a local array in `SettingsContent`. It now reads the
 * registry, so these cases pin what a reader sees: eight tabs in registry
 * order, the same labels and icons, one selected tab, and the tab id the host
 * receives through the opener adapter.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import SettingsTabBar from "./SettingsTabBar.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render(active: string, onSelect = vi.fn()) {
    component = mount(SettingsTabBar, {
        target: host,
        props: { active, onSelect },
    });
    flushSync();
    return host;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("FEAT-0735: SettingsTabBar", () => {
    it("renders the eight registry tabs in order with icons", () => {
        const el = render("trading");
        const tabs = Array.from(el.querySelectorAll('[role="tab"]'));

        expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
            lookup("settings.tabs.trading"),
            lookup("settings.tabs.automation"),
            lookup("settings.tabs.chart"),
            lookup("settings.tabs.visuals"),
            lookup("settings.tabs.ai"),
            lookup("settings.tabs.connections"),
            lookup("settings.tabs.system"),
            lookup("settings.tabs.cloud"),
        ]);
        for (const tab of tabs) {
            expect(tab.querySelector("svg")).not.toBeNull();
        }
    });

    it("marks exactly the active tab and reports the selected id", () => {
        const onSelect = vi.fn();
        const el = render("chart", onSelect);
        const tabs = Array.from(el.querySelectorAll('[role="tab"]'));

        const selected = tabs
            .filter((tab) => tab.getAttribute("aria-selected") === "true")
            .map((tab) => tab.textContent?.trim());
        expect(selected).toEqual([lookup("settings.tabs.chart")]);

        (tabs[3] as HTMLElement).click();
        flushSync();

        expect(onSelect).toHaveBeenCalledWith("visuals");
    });
});
