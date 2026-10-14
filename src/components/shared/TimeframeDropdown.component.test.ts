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
 * FEAT-0683 — the timeframe chip and its quick-pick dropdown, shared by the
 * Technicals panel and the Academy lesson chart.
 *
 * The component owns only its popup's state: what a pick *means* is the
 * caller's `onSelect`. So these tests assert exactly that boundary — the chip
 * shows `value`, a pick or a normalised custom entry reaches `onSelect` once,
 * the popup closes behind it — and leave "is this drawable" to the caller, which
 * is where the store's own notation is known.
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

import TimeframeDropdown from "./TimeframeDropdown.svelte";

const OPTIONS = ["5m", "15m", "30m", "1h", "4h", "1d"] as const;

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let selected: string[] = [];

function render(value = "1h"): HTMLElement {
    if (component) {
        unmount(component as never);
        component = null;
    }
    host.innerHTML = "";
    selected = [];

    component = mount(TimeframeDropdown, {
        target: host,
        props: {
            value,
            options: OPTIONS,
            onSelect: (timeframe: string) => selected.push(timeframe),
            label: "Timeframe",
        },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

/** The chip: the only button outside the popup. */
function chip(root: HTMLElement): HTMLButtonElement {
    const button = root.querySelector<HTMLButtonElement>("button");
    if (!button) throw new Error("no chip rendered");
    return button;
}

/** The popup's grid, opened by clicking the chip. */
function openPopup(root: HTMLElement): HTMLElement {
    chip(root).click();
    flushSync();
    const grid = root.querySelector(".grid");
    if (!grid) throw new Error("the popup did not open");
    return grid as HTMLElement;
}

function buttonWith(root: HTMLElement, text: string): HTMLButtonElement {
    const button = [...root.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === text,
    );
    if (!button) throw new Error(`no '${text}' button rendered`);
    return button as HTMLButtonElement;
}

function customField(root: HTMLElement): HTMLInputElement {
    const input = root.querySelector("input");
    if (!input) throw new Error("no custom timeframe field rendered");
    return input as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0683 — the shared timeframe dropdown", () => {
    it("shows the current timeframe on the chip, with the popup closed", () => {
        const root = render("4h");

        expect(chip(root).textContent?.trim()).toBe("4h");
        expect(chip(root).getAttribute("aria-label")).toBe("Timeframe");
        expect(chip(root).getAttribute("aria-expanded")).toBe("false");
        expect(root.querySelector(".grid")).toBeNull();
    });

    it("offers every quick pick once the chip is clicked", () => {
        const root = render();
        const grid = openPopup(root);

        expect(chip(root).getAttribute("aria-expanded")).toBe("true");
        expect([...grid.querySelectorAll("button")].map((button) => button.textContent?.trim())).toEqual([
            ...OPTIONS,
        ]);
    });

    it("hands a pick to the caller once and closes behind it", () => {
        const root = render();
        openPopup(root);

        buttonWith(root, "15m").click();
        flushSync();

        expect(selected).toEqual(["15m"]);
        expect(root.querySelector(".grid")).toBeNull();
    });

    it("normalises a custom timeframe before handing it over", () => {
        const root = render();
        openPopup(root);
        type(customField(root), "240m");

        buttonWith(root, lookup("common.ok")).click();
        flushSync();

        // The app's notation: 240 minutes is what its own conversion calls 4h.
        expect(selected).toEqual(["4h"]);
        expect(root.querySelector(".grid")).toBeNull();
    });

    it("submits on Enter as well as on OK, and clears the field", () => {
        const root = render();
        openPopup(root);
        type(customField(root), "1T");

        customField(root).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        flushSync();

        expect(selected).toEqual(["1d"]);
    });

    it("does nothing on an empty submission", () => {
        const root = render();
        openPopup(root);

        buttonWith(root, lookup("common.ok")).click();
        flushSync();

        expect(selected).toEqual([]);
        // Still open: an empty submission is not a choice.
        expect(root.querySelector(".grid")).not.toBeNull();
    });

    it("closes on a click outside it", () => {
        const root = render();
        openPopup(root);

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        flushSync();

        expect(root.querySelector(".grid")).toBeNull();
    });
});
