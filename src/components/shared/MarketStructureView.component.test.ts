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
 * FEAT-0767 — the market-structure tab as a lesson.
 *
 * The tab used to be a live dashboard. What must hold now is the absence of
 * one: no chart, no subscription, no reading strip. Each card carries exactly
 * one schematic that shows the thing it teaches, because a card without its
 * picture is the poster the dashboard already was.
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

/* The lesson must not open a market channel; the mock proves it does not. */
vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn(), ensureHistory: vi.fn() },
}));

import MarketStructureView from "./MarketStructureView.svelte";
import { marketWatcher } from "../../services/marketWatcher";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let onOpenIndicators: ReturnType<typeof vi.fn>;

function renderView(): HTMLElement {
    if (component) {
        unmount(component as never);
        component = null;
    }
    host.innerHTML = "";

    component = mount(MarketStructureView, {
        target: host,
        props: { onOpenIndicators },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `the view rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

const SECTIONS = ["s1", "s2", "s3", "s4a", "s4b"] as const;

beforeEach(() => {
    onOpenIndicators = vi.fn();
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0767 — the market-structure lesson", () => {
    it("renders the five steps in reading order", () => {
        const view = renderView();

        const cards = [...view.querySelectorAll("[data-testid^='structure-s']")].filter((node) =>
            SECTIONS.some((key) => node.getAttribute("data-testid") === `structure-${key}`),
        );
        expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual(
            SECTIONS.map((key) => `structure-${key}`),
        );

        for (const key of SECTIONS) {
            const card = view.querySelector(`[data-testid="structure-${key}"]`)!;
            expect(card.textContent).toContain(lookup(`academy.structure.${key}.title`));
            expect(card.textContent).toContain(lookup(`academy.structure.${key}.takeaway`));
            expect(card.textContent).toContain(lookup(`academy.structure.${key}.body`));
        }
    });

    it("gives every card exactly one schematic and keeps the s2 legend", () => {
        const view = renderView();

        for (const key of SECTIONS) {
            const card = view.querySelector(`[data-testid="structure-${key}"]`)!;
            expect(card.querySelectorAll("svg").length, `svg count in ${key}`).toBe(1);
            expect(card.querySelector(`[data-testid="structure-diagram-${key}"]`)).not.toBeNull();
        }

        const s2 = view.querySelector('[data-testid="structure-s2"]')!;
        for (const legend of ["legendSwings", "legendBos", "legendChoch", "legendZone"]) {
            expect(s2.textContent).toContain(lookup(`academy.structure.s2.${legend}`));
        }
    });

    it("mounts no chart and no reading strip", () => {
        const view = renderView();

        expect(view.querySelector("canvas")).toBeNull();
        expect(view.querySelector("[data-testid^='structure-chart-']")).toBeNull();
        expect(view.querySelector("[data-testid='structure-readout']")).toBeNull();
        // No picker of any kind: the only controls are the five lesson chips,
        // asserted by count so a restored dropdown cannot slip past a label.
        expect(view.querySelectorAll("button")).toHaveLength(5);
        expect(view.querySelectorAll("select, [role='combobox']")).toHaveLength(0);
    });

    it("subscribes to no market channel", () => {
        renderView();

        expect(marketWatcher.register).not.toHaveBeenCalled();
        expect(marketWatcher.ensureHistory).not.toHaveBeenCalled();
    });

    it("points at the Technicals panel where the order is applied", () => {
        const view = renderView();

        expect(view.textContent).toContain(lookup("academy.structure.panelHint"));
    });

    it("opens the matching indicator lesson from every chip", () => {
        const view = renderView();

        for (const id of ["ema", "adx", "choppiness", "bollinger", "atr"]) {
            const chip = view.querySelector<HTMLButtonElement>(`[data-testid="structure-open-${id}"]`);
            expect(chip, `no chip for ${id}`).not.toBeNull();
            chip!.click();
            flushSync();
            expect(onOpenIndicators).toHaveBeenLastCalledWith(id);
        }
        expect(onOpenIndicators).toHaveBeenCalledTimes(5);
    });

    it("describes each drawing instead of repeating its heading", () => {
        const view = renderView();

        for (const key of SECTIONS) {
            const card = view.querySelector(`[data-testid="structure-${key}"]`)!;
            const svg = card.querySelector(`[data-testid="structure-diagram-${key}"]`)!;
            expect(svg.getAttribute("aria-labelledby"), key).toBe(`structure-alt-${key}`);
            expect(card.textContent, key).toContain(lookup(`academy.structure.${key}.diagramAlt`));
        }
    });
});
