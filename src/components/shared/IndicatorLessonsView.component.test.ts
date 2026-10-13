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
 * FEAT-0677 — the "Indicators & Setups" tab.
 *
 * The list half of the item: every registry indicator is reachable, search and
 * the group filter narrow it, favourites persist under their own key, and the
 * detail pane shows the four ADR-0025 fields plus the catalogue's own
 * parameters. The live chart is a separate slice and is not covered here.
 *
 * Mounted through `AcademyContent` so the assertions cover the real wiring —
 * the panel switch, the persisted tab id and the tab bar — rather than the view
 * in isolation. The two pattern views are stubbed so the default tab does not
 * drag Chart.js into happy-dom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import { INDICATOR_GROUP_ORDER, REGISTRY_CATALOGUE, indicatorsInGroup } from "../../lib/alerts/indicatorCatalogue";
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

vi.mock("./ChartPatternsView.svelte", async () => ({
    default: (await import("../../tests/helpers/EmptyStub.svelte")).default,
}));
vi.mock("./CandlestickPatternsView.svelte", async () => ({
    default: (await import("../../tests/helpers/EmptyStub.svelte")).default,
}));

import AcademyContent from "./AcademyContent.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

/** Opens the Indicators tab and returns its view root. */
function renderIndicatorsTab(): HTMLElement {
    component = mount(AcademyContent, { target: host }) as never;
    flushSync();

    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const indicatorsTab = tabs.find((tab) => tab.textContent?.trim() === lookup("indicatorLessons.title"));
    if (!indicatorsTab) throw new Error("the indicators tab is not rendered");
    indicatorsTab.click();
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    return root.children[1].firstElementChild as HTMLElement;
}

/** The lesson rows in the sidebar list — one per visible indicator. */
function lessonRows(view: HTMLElement): HTMLButtonElement[] {
    const sidebar = view.children[0] as HTMLElement;
    const list = sidebar.children[1] as HTMLElement;
    return [...list.querySelectorAll("button")];
}

function searchBox(view: HTMLElement): HTMLInputElement {
    return view.querySelector("input") as HTMLInputElement;
}

function groupSelect(view: HTMLElement): HTMLSelectElement {
    return view.querySelector("select") as HTMLSelectElement;
}

describe("FEAT-0677 — the Indicators & Setups tab", () => {
    it("lists every registry indicator and persists the tab it opened on", () => {
        const view = renderIndicatorsTab();

        expect(lessonRows(view).length).toBe(REGISTRY_CATALOGUE.length);
        expect(localStorage.getItem("academy_active_tab")).toBe("indicators");

        // Every group heading of the catalogue is present, in its own language.
        for (const group of INDICATOR_GROUP_ORDER) {
            expect(view.textContent).toContain(lookup(`dashboard.alerts.indicators.group.${group}`));
        }
    });

    it("narrows the list by localized indicator name", () => {
        const view = renderIndicatorsTab();
        const input = searchBox(view);
        expect(input.getAttribute("aria-label")).toBe(lookup("indicatorLessons.searchLabel"));

        input.value = lookup("dashboard.alerts.indicators.name.adx");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();

        const rows = lessonRows(view);
        expect(rows.length).toBe(1);
        expect(rows[0].textContent).toContain(lookup("dashboard.alerts.indicators.name.adx"));

        input.value = "zzz-no-such-indicator";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();

        expect(lessonRows(view).length).toBe(0);
        expect(view.textContent).toContain(lookup("indicatorLessons.noLessons"));
    });

    it("narrows the list to a single catalogue group", () => {
        const view = renderIndicatorsTab();
        const select = groupSelect(view);
        expect(select.getAttribute("aria-label")).toBe(lookup("indicatorLessons.groupLabel"));

        select.value = "trend";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();

        // The expectation is built from the catalogue, so a recategorised
        // indicator moves it along instead of breaking this test.
        const expected = indicatorsInGroup("trend").map((entry) =>
            lookup(`dashboard.alerts.indicators.name.${entry.id}`),
        );
        const shown = lessonRows(view).map((row) => row.textContent?.trim() ?? "");
        expect(shown.slice().sort()).toEqual(expected.slice().sort());
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.length).toBeLessThan(REGISTRY_CATALOGUE.length);
    });

    it("toggles a favourite and keeps it under the lesson's own storage key", () => {
        const view = renderIndicatorsTab();

        const favorite = view.querySelector("button[aria-pressed]") as HTMLButtonElement;
        expect(favorite).not.toBeNull();
        expect(favorite.getAttribute("aria-pressed")).toBe("false");

        favorite.click();
        flushSync();

        expect(favorite.getAttribute("aria-pressed")).toBe("true");
        const stored = JSON.parse(localStorage.getItem("indicator_lesson_favorites") ?? "[]");
        expect(stored.length).toBe(1);
        // The pattern tabs' keys must stay untouched by this one.
        expect(localStorage.getItem("chart_pattern_favorites")).toBeNull();

        selectFavoriteFilter(view);

        expect(lessonRows(view).length).toBe(1);
    });

    it("shows the four lesson fields and the catalogue's parameters", () => {
        const view = renderIndicatorsTab();

        for (const heading of [
            "whatItMeasures",
            "howToRead",
            "failureModes",
            "confirmation",
        ]) {
            expect(view.textContent).toContain(lookup(`indicatorLessons.field.${heading}`));
        }

        // The first group in INDICATOR_GROUP_ORDER is selected on mount, so the
        // opened lesson is that group's first catalogue entry.
        const opened = indicatorsInGroup(INDICATOR_GROUP_ORDER[0])[0];
        expect(view.textContent).toContain(lookup(`dashboard.alerts.indicators.name.${opened.id}`));

        for (const field of ["whatItMeasures", "howToRead", "failureModes", "confirmation"]) {
            expect(view.textContent).toContain(lookup(`academy.indicators.${opened.id}.${field}`));
        }

        for (const param of opened.params) {
            expect(view.textContent).toContain(lookup(`dashboard.alerts.indicators.param.${param.name}`));
            expect(view.textContent).toContain(String(param.default));
        }
    });
});

/** Switches the group filter to Favorites. */
function selectFavoriteFilter(view: HTMLElement) {
    const select = groupSelect(view);
    select.value = "favorites";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}
