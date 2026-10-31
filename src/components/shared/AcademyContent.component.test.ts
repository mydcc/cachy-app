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
 * FEAT-0346 — AcademyContent is the Academy's tab shell. Its state machine is
 * small but user-visible: the right tab renders, and the last tab survives a
 * reload through localStorage.
 *
 * FEAT-0677 added the third tab, FEAT-0679 the fourth. This file stays on what
 * all tabs share; the indicators tab's own behaviour lives in
 * `IndicatorLessonsView.component.test.ts`, which mounts the real view rather
 * than a stub.
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
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

// Two distinguishable stubs so the test can tell which tab's view is mounted.
vi.mock("./ChartPatternsView.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));
vi.mock("./CandlestickPatternsView.svelte", async () => ({
    default: (await import("../../tests/helpers/EmptyStub.svelte")).default,
}));
// The structure tab mounts live lesson charts; like the responsive suite,
// this shell file stubs the canvas rather than dragging Chart.js in.
vi.mock("./IndicatorLessonChart.svelte", async () => ({
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

function render() {
    component = mount(AcademyContent, { target: host }) as never;
    flushSync();
}

/*
 * BUG-0762: tabs render both label variants (short + full) in the DOM for
 * the container-query switch, so textContent is no longer a stable lookup.
 * The accessible name is the full label, at every width.
 */
function tabButton(labelKey: string): HTMLButtonElement {
    const el = [...host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
        (b) => b.getAttribute("aria-label") === lookup(labelKey),
    );
    if (!el) throw new Error(`tab ${labelKey} not rendered`);
    return el;
}

describe("FEAT-0346 — AcademyContent switches between the Academy tabs", () => {
    it("opens on the chart-patterns tab by default", () => {
        render();

        expect(host.querySelector('[data-testid="modal-frame-stub"]')).toBeTruthy();
        expect(host.querySelector('[data-testid="empty-stub"]')).toBeNull();
        expect(tabButton("chartPatterns.title").classList.contains("bg-[var(--bg-tertiary)]")).toBe(
            true,
        );
    });

    it("switches to the candlestick tab and remembers it", () => {
        render();

        tabButton("candlestickPatterns.title").click();
        flushSync();

        expect(host.querySelector('[data-testid="empty-stub"]')).toBeTruthy();
        expect(host.querySelector('[data-testid="modal-frame-stub"]')).toBeNull();
        expect(localStorage.getItem("academy_active_tab")).toBe("candlestickPatterns");
    });

    it("restores the last tab on mount", () => {
        localStorage.setItem("academy_active_tab", "candlestickPatterns");
        render();

        expect(host.querySelector('[data-testid="empty-stub"]')).toBeTruthy();
        expect(tabButton("candlestickPatterns.title").classList.contains("bg-[var(--bg-tertiary)]")).toBe(
            true,
        );
    });

    it("falls back to the default tab for a stored id it does not know", () => {
        localStorage.setItem("academy_active_tab", "no-such-tab");
        render();

        expect(host.querySelector('[data-testid="modal-frame-stub"]')).toBeTruthy();
        expect(host.querySelector('[data-testid="empty-stub"]')).toBeNull();
        expect(tabButton("chartPatterns.title").classList.contains("bg-[var(--bg-tertiary)]")).toBe(
            true,
        );
    });

    it("switches to the market-structure tab and remembers it", () => {
        render();

        tabButton("academy.structure.title").click();
        flushSync();

        expect(host.querySelector('[data-testid="structure-view"]')).toBeTruthy();
        expect(localStorage.getItem("academy_active_tab")).toBe("marketStructure");
    });

    it("deep-links a structure lesson button into the indicators tab", () => {
        render();

        // FEAT-0679: the button names ATR, so the indicators tab must open
        // with ATR selected — not with whatever lesson was selected before.
        tabButton("academy.structure.title").click();
        flushSync();
        const atrButton = host.querySelector('[data-testid="structure-open-atr"]');
        expect(atrButton, "ATR lesson button missing").toBeTruthy();
        (atrButton as HTMLButtonElement).click();
        flushSync();

        expect(localStorage.getItem("academy_active_tab")).toBe("indicators");
        const atrName = lookup("dashboard.alerts.indicators.name.atr");
        const selected = [...host.querySelectorAll("button")].find(
            (button) =>
                button.textContent?.includes(atrName) &&
                button.getAttribute("aria-current") === "true",
        );
        expect(selected, "ATR lesson not selected after deep link").toBeTruthy();
    });
});
