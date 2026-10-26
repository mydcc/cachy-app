// @vitest-environment jsdom
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
 * FEAT-0734 -- the journal's five chart-preset tabs.
 *
 * The strip used to be a default list inside `DashboardNav`. It now reads the
 * registry, so these tests pin the visible result: five tabs in registry
 * order, the same labels and icons, the active styling, and the tab id the
 * host receives on selection.
 *
 * jsdom instead of happy-dom: `DashboardNav` sanitizes icon markup with
 * DOMPurify, whose parser misbehaves under happy-dom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
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

import JournalTabStrip from "./JournalTabStrip.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render(activePreset: string, onselect = vi.fn()) {
    component = mount(JournalTabStrip, {
        target: host,
        props: { activePreset, onselect },
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

describe("FEAT-0734: JournalTabStrip", () => {
    it("renders the five registry tabs in order with icons", () => {
        const el = render("performance");
        const buttons = Array.from(el.querySelectorAll("button"));

        expect(
            buttons.map((button) => button.textContent?.trim()),
        ).toEqual([
            lookup("journal.deepDive.performance"),
            lookup("journal.deepDive.systemQuality"),
            lookup("journal.deepDive.charts.labels.trends"),
            lookup("journal.deepDive.behavior"),
            lookup("journal.deepDive.charts.labels.fees"),
        ]);
        for (const [index, button] of buttons.entries()) {
            expect(
                button.querySelector("svg"),
                `button ${index}: ${button.innerHTML}`,
            ).not.toBeNull();
        }
    });

    it("marks the active tab and reports the tab id on selection", () => {
        const onselect = vi.fn();
        const el = render("quality", onselect);
        const buttons = Array.from(el.querySelectorAll("button"));

        expect(buttons[1].className).toContain("font-bold");
        expect(buttons[0].className).not.toContain("font-bold");

        buttons[2].click();
        flushSync();

        expect(onselect).toHaveBeenCalledWith("direction");
    });
});
