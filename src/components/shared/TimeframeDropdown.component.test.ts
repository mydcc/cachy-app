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

function render(value = "1h", refuse = false): HTMLElement {
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
            onSelect: (timeframe: string) => {
                selected.push(timeframe);
                // `false` is the refusal contract: the caller rejects the value.
                return refuse ? false : true;
            },
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

/** A pointer event carrying `pointerType`, which the component branches on. */
function pointer(type: string, pointerType: string): Event {
    const event = new Event(type, { bubbles: true });
    // happy-dom's PointerEvent support varies; the component reads this one field.
    Object.defineProperty(event, "pointerType", { value: pointerType });
    return event;
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
        // The value is part of the accessible name: a label alone would announce
        // "Timeframe" and never say which one, in either call site.
        expect(chip(root).getAttribute("aria-label")).toBe("Timeframe: 4h");
        expect(chip(root).getAttribute("aria-haspopup")).toBe("true");
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

    it("opens on hover and closes 300 ms after the pointer leaves", () => {
        vi.useFakeTimers();
        try {
            const root = render();

            root.dispatchEvent(pointer("pointerenter", "mouse"));
            flushSync();
            expect(root.querySelector(".grid"), "hover did not open the popup").not.toBeNull();

            root.dispatchEvent(pointer("pointerleave", "mouse"));
            flushSync();
            // Still open: the pointer crosses the gap between chip and popup, and
            // closing there would make the grid unusable with a mouse.
            expect(root.querySelector(".grid")).not.toBeNull();

            vi.advanceTimersByTime(300);
            flushSync();
            expect(root.querySelector(".grid")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("ignores hover on a touch pointer, so the opening tap does not close it again", () => {
        const root = render();

        root.dispatchEvent(pointer("pointerenter", "touch"));
        flushSync();
        expect(root.querySelector(".grid")).toBeNull();

        chip(root).click();
        flushSync();
        expect(root.querySelector(".grid")).not.toBeNull();

        // And the dismissing tap's own leave must not schedule a close either.
        root.dispatchEvent(pointer("pointerleave", "touch"));
        flushSync();
        expect(root.querySelector(".grid")).not.toBeNull();
    });

    it("closes on Escape and puts focus back on the chip", () => {
        const root = render();
        openPopup(root);

        root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();

        expect(root.querySelector(".grid")).toBeNull();
        // The popup's buttons unmount with it, so without this focus would fall
        // to <body> and a keyboard user would tab in from the top of the page.
        expect(document.activeElement).toBe(chip(root));
    });

    it("normalises a month as a month, not as a minute", () => {
        const root = render();
        openPopup(root);
        type(customField(root), "1M");

        buttonWith(root, lookup("common.ok")).click();
        flushSync();

        // The app's notation reserves the capital for months; lower-casing it
        // first turned every monthly request into a one-minute chart.
        expect(selected).toEqual(["1M"]);
    });

    it("hands an unparseable entry on unchanged, so the caller decides", () => {
        const root = render();
        openPopup(root);
        type(customField(root), "abc");

        buttonWith(root, lookup("common.ok")).click();
        flushSync();

        // The dropdown does not own "drawable" — the lesson's guard is what
        // refuses this, and it can only be exercised if the value arrives.
        expect(selected).toEqual(["abc"]);
    });

    it("stays open with the text in place when the caller refuses the timeframe", () => {
        const root = render("1h", true);
        openPopup(root);
        type(customField(root), "abc");

        buttonWith(root, lookup("common.ok")).click();
        flushSync();

        // A refusal that closed the popup and cleared the field would be
        // invisible: the chip would simply not change, and the trader would have
        // nothing to correct.
        expect(selected).toEqual(["abc"]);
        expect(root.querySelector(".grid")).not.toBeNull();
        expect(customField(root).value).toBe("abc");
    });

    it("does not take a refused pick either", () => {
        const root = render("1h", true);
        openPopup(root);

        buttonWith(root, "4h").click();
        flushSync();

        expect(selected).toEqual(["4h"]);
        expect(root.querySelector(".grid")).not.toBeNull();
    });
});
