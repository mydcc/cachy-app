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
 * Four sections in reading order from `academy.structure.*`, a static
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
    default: (await import("../../tests/helpers/EmptyStub.svelte")).default,
}));

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
    it("renders all four sections with their locale titles", () => {
        const view = renderView();
        for (const section of ["s1", "s2", "s3", "s4"]) {
            const article = view.querySelector(`[data-testid="structure-${section}"]`);
            expect(article, `section ${section} missing`).not.toBeNull();
            expect(article?.textContent).toContain(lookup(`academy.structure.${section}.title`));
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
        // One chart per demo entry: ema, adx, bollinger.
        expect(shown.querySelectorAll('[data-testid="empty-stub"]').length).toBe(3);
        expect(shown.textContent).toContain(lookup("academy.structure.s1.chartHint"));
    });
});
