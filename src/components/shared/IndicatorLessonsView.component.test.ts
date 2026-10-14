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

import {
    INDICATOR_CATALOGUE,
    INDICATOR_GROUP_ORDER,
    indicatorsInGroup,
} from "../../lib/alerts/indicatorCatalogue";
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
// The live chart has its own suite (IndicatorLessonChart.component.test.ts);
// this file is about the list and the detail pane, so the canvas is stubbed
// rather than dragged into happy-dom.
vi.mock("./IndicatorLessonChart.svelte", async () => ({
    default: (await import("../../tests/helpers/ChartPropsProbe.svelte")).default,
}));

import AcademyContent from "./AcademyContent.svelte";
import IndicatorLessonsView from "./IndicatorLessonsView.svelte";
import { indicatorState, shippedIndicatorDefaults } from "../../stores/indicator.svelte";
import { lessonParams } from "../../lib/academy/lessonSettings";

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

/** The right-hand column of the split layout, where the engine cards live. */
function rightColumn(view: HTMLElement): HTMLElement {
    const split = [...view.querySelectorAll("div")].find((candidate) =>
        candidate.classList.contains("@lg:flex-row"),
    );
    if (!split) throw new Error("no split layout in the lesson view");
    const column = split.children[1];
    if (!column) throw new Error("no right column in the lesson view");
    return column as HTMLElement;
}

/** The parameters card in the detail pane, reached through the split layout. */
function paramsSection(view: HTMLElement): HTMLElement {
    return rightColumn(view).children[0] as HTMLElement;
}

/** The formula card, below the parameters card. */
function formulaSection(view: HTMLElement): HTMLElement {
    const card = rightColumn(view).children[1];
    if (!card) throw new Error("no formula card in the lesson view");
    return card as HTMLElement;
}

describe("FEAT-0677 — the Indicators & Setups tab", () => {
    it("lists exactly the indicators the alert path offers, and persists the tab it opened on", () => {
        const view = renderIndicatorsTab();

        /*
         * The view renders `LESSON_GROUPS`, which is built over
         * `INDICATOR_CATALOGUE` — the alert-path subset, not the whole
         * registry. Pinning this to `REGISTRY_CATALOGUE` would fail in the
         * wrong direction the day the alert path hides an indicator again: the
         * list would correctly shrink while the test demanded the hidden one.
         */
        const offered = INDICATOR_CATALOGUE.map((entry) =>
            lookup(`dashboard.alerts.indicators.name.${entry.id}`),
        );
        const shown = lessonRows(view).map((row) => row.textContent?.trim() ?? "");
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.slice().sort()).toEqual(offered.slice().sort());

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
        expect(shown.length).toBeLessThan(INDICATOR_CATALOGUE.length);
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
        // Both pattern tabs' keys must stay untouched by this one.
        expect(localStorage.getItem("chart_pattern_favorites")).toBeNull();
        expect(localStorage.getItem("candlestick_favorites")).toBeNull();

        selectFavoriteFilter(view);

        expect(lessonRows(view).length).toBe(1);
    });

    it("shows the four lesson fields and the parameters the chart drew with, for every indicator", () => {
        const view = renderIndicatorsTab();

        for (const heading of ["whatItMeasures", "howToRead", "failureModes", "confirmation"]) {
            expect(view.textContent).toContain(lookup(`indicatorLessons.field.${heading}`));
        }

        /*
         * Every indicator, not only the one that happens to open: a factor's
         * default is carried as a string (`bollinger.std_dev` is "2"), so
         * checking one period-typed entry would leave that path unexercised.
         */
        for (const entry of INDICATOR_CATALOGUE) {
            const name = lookup(`dashboard.alerts.indicators.name.${entry.id}`);
            const row = lessonRows(view).find(
                (candidate) => candidate.textContent?.trim() === name,
            );
            if (!row) throw new Error(`no sidebar row for ${entry.id}`);
            row.click();
            flushSync();

            for (const field of ["whatItMeasures", "howToRead", "failureModes", "confirmation"]) {
                expect(view.textContent, `${entry.id}.${field}`).toContain(
                    lookup(`academy.indicators.${entry.id}.${field}`),
                );
            }

            const section = paramsSection(view);
            if (entry.params.length === 0) {
                expect(section.querySelectorAll("li").length, entry.id).toBe(0);
                expect(section.textContent).toContain(lookup("indicatorLessons.parametersEmpty"));
                continue;
            }

            const rows = [...section.querySelectorAll("li")];
            expect(rows.length, entry.id).toBe(entry.params.length);

            /*
             * FEAT-0681: the chart and the card must be given the same number.
             * Reading the resolver once and asserting *both* consumers against it
             * is what keeps this from being circular — a components-side
             * regression (a card rendering `param.default`, or a chart handed no
             * parameters) puts the two sides out of step and fails here.
             */
            const configured = lessonParams(entry, indicatorState, shippedIndicatorDefaults()).values;
            const chartParams = JSON.parse(
                view
                    .querySelector('[data-testid="chart-probe"]')
                    ?.getAttribute("data-params") ?? "{}",
            ) as Record<string, unknown>;

            for (const param of entry.params) {
                const label = lookup(`dashboard.alerts.indicators.param.${param.name}`);
                // Bound to the parameter's own row: a bare `toContain` over the
                // whole card would be satisfied by a digit appearing anywhere.
                const row = rows.find((candidate) => candidate.textContent?.includes(label));
                expect(row, `${entry.id}.${param.name}`).toBeDefined();
                const shown = configured[param.name] ?? param.default;
                expect(row?.textContent, `${entry.id}.${param.name}.value`).toContain(String(shown));
                expect(chartParams[param.name], `${entry.id}.${param.name}.chart`).toEqual(shown);
            }
        }
    });

    it("renders the live chart only when the host asks for it", () => {
        // The public SEO route passes `showLiveChart={false}`; the app window
        // leaves the default. The stub stands in for the canvas.
        component = mount(IndicatorLessonsView, {
            target: host,
            props: { showLiveChart: false },
        }) as never;
        flushSync();
        expect(host.querySelector('[data-testid="chart-probe"]')).toBeNull();

        unmount(component as never);
        component = null;
        host.innerHTML = "";

        component = mount(IndicatorLessonsView, {
            target: host,
            props: { showLiveChart: true },
        }) as never;
        flushSync();
        expect(host.querySelector('[data-testid="chart-probe"]')).not.toBeNull();
    });

    it("shows parameter values without provenance badges", () => {
        // The settings store is the app-wide singleton, so the changed value is
        // restored in the `finally`: a leaked write would make every later test
        // read 21.
        const previous = indicatorState.rsi.length;
        try {
            indicatorState.rsi.length = 21;
            const view = renderIndicatorsTab();

            const rsiRow = lessonRows(view).find((row) =>
                row.textContent?.includes(lookup("dashboard.alerts.indicators.name.rsi")),
            );
            if (!rsiRow) throw new Error("the RSI lesson is not in the list");
            rsiRow.click();
            flushSync();

            // A configured value renders as the bare number: no "your setting"
            // badge, no "standard" badge. The number is the whole statement.
            // Literals, not lookups: the i18n mock above pins the locale to
            // "en", and the keys themselves are gone from the dictionary.
            const card = paramsSection(view);
            expect(card.textContent).toContain("21");
            expect(card.textContent).not.toContain("Your setting");
            expect(card.textContent).not.toContain("Default");

            /*
             * Back to the shipped default. The card keeps showing a number, now
             * the catalogue's — still without any badge. This also pins that
             * the card re-derives from the store without a remount.
             */
            indicatorState.rsi.length = previous;
            flushSync();

            const cardAgain = paramsSection(view);
            expect(cardAgain.textContent).toContain(String(previous));
            expect(cardAgain.textContent).not.toContain("Your setting");
            expect(cardAgain.textContent).not.toContain("Default");
        } finally {
            indicatorState.rsi.length = previous;
        }
    });

    it("renders the open indicator's formula as typeset maths, not as LaTeX source", () => {
        const view = renderIndicatorsTab();

        const rsiRow = lessonRows(view).find((row) =>
            row.textContent?.includes(lookup("dashboard.alerts.indicators.name.rsi")),
        );
        if (!rsiRow) throw new Error("the RSI lesson is not in the list");
        rsiRow.click();
        flushSync();

        const card = formulaSection(view);
        expect(card.textContent).toContain(lookup("indicatorLessons.formula"));
        // KaTeX renders into `.katex`. Raw `$$` left in the text would mean the
        // Markdown action never ran and the reader got LaTeX source.
        expect(card.querySelector(".katex"), "the formula was not typeset").not.toBeNull();
        expect(card.textContent).not.toContain("$$");
        expect(card.textContent).toContain("RSI");
    });

    it("hands the chart the parameters and the source the card shows", () => {
        const previousLength = indicatorState.rsi.length;
        const previousSource = indicatorState.rsi.source;
        try {
            indicatorState.rsi.length = 21;
            indicatorState.rsi.source = "hl2";
            const view = renderIndicatorsTab();

            const rsiRow = lessonRows(view).find((row) =>
                row.textContent?.includes(lookup("dashboard.alerts.indicators.name.rsi")),
            );
            if (!rsiRow) throw new Error("the RSI lesson is not in the list");
            rsiRow.click();
            flushSync();

            // The probe records what the parent passed; without it this contract
            // — the view resolving the inputs once for two consumers — is
            // asserted by nothing.
            const probe = view.querySelector('[data-testid="chart-probe"]');
            expect(probe, "the chart was not rendered").not.toBeNull();
            expect(probe?.getAttribute("data-entry-id")).toBe("rsi");
            expect(JSON.parse(probe?.getAttribute("data-params") ?? "{}")).toEqual({ period: 21 });
            // The price too: the chart window honours the card's source, so the
            // lesson has to draw the same one.
            expect(probe?.getAttribute("data-field")).toBe("hl2");
            expect(paramsSection(view).textContent).toContain("21");
        } finally {
            indicatorState.rsi.length = previousLength;
            indicatorState.rsi.source = previousSource;
        }
    });

    it("shows the shipped default as a bare number while nothing was changed", () => {
        const view = renderIndicatorsTab();

        // The store's first EMA length is 21 where the catalogue's alert default
        // is 20. The card shows the value the chart draws with — 21 — and no
        // provenance badge either way. Literals, not lookups: the i18n mock
        // pins the locale to "en", and the badge keys are gone.
        const emaRow = lessonRows(view).find((row) =>
            row.textContent?.includes(lookup("dashboard.alerts.indicators.name.ema")),
        );
        if (!emaRow) throw new Error("the EMA lesson is not in the list");
        emaRow.click();
        flushSync();

        const card = paramsSection(view);
        expect(card.textContent).toContain("21");
        expect(card.textContent).not.toContain("Your setting");
        expect(card.textContent).not.toContain("Default");
    });
});

/** Switches the group filter to Favorites. */
function selectFavoriteFilter(view: HTMLElement) {
    const select = groupSelect(view);
    select.value = "favorites";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
}
