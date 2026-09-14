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
 * FEAT-0346 — TimeframeSelector is used wherever a list of timeframes is
 * configured. It normalises what is typed, refuses duplicates, and stops at
 * `maxItems` instead of silently dropping the last one.
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
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

vi.mock("../../utils/utils", () => ({
    normalizeTimeframeInput: (input: string) => input.trim().toLowerCase(),
}));

import TimeframeSelector from "./TimeframeSelector.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let originalAnimate: typeof HTMLElement.prototype.animate | undefined;

/*
 * The chips carry `in:scale`/`out:scale`; happy-dom's Web Animations
 * implementation rejects `finished` when Svelte aborts an interruptible
 * transition on unmount, which vitest reports as an unhandled rejection.
 * Tests here care about the tag edits, not the animation, so the animation
 * layer is stubbed out.
 */
beforeEach(() => {
    originalAnimate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = (() => ({
        currentTime: 0,
        playState: "finished",
        onfinish: null,
        effect: null,
        finished: Promise.resolve(),
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (originalAnimate) {
        HTMLElement.prototype.animate = originalAnimate;
    } else {
        delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(TimeframeSelector, { target: host, props }) as never;
    flushSync();
}

function textInput(): HTMLInputElement | null {
    return host.querySelector<HTMLInputElement>('input[type="text"]');
}

function type(value: string) {
    const el = textInput();
    if (!el) throw new Error("input not rendered");
    el.dispatchEvent(new Event("focus"));
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

function pressEnter() {
    textInput()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    flushSync();
}

describe("FEAT-0346 — TimeframeSelector owns the list but reports every edit", () => {
    it("renders each selected timeframe as a chip", () => {
        render({ selected: ["15m", "1h"] });

        expect(host.textContent).toContain("15m");
        expect(host.textContent).toContain("1h");
    });

    it("removes the chip that was clicked", () => {
        const onchange = vi.fn();
        render({ selected: ["15m", "1h"], onchange });

        host.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove timeframe"]')[0].click();

        expect(onchange).toHaveBeenCalledWith(["1h"]);
    });

    it("adds a typed timeframe through the normaliser", () => {
        const onchange = vi.fn();
        render({ selected: ["15m"], onchange });

        type("1H");
        pressEnter();

        expect(onchange).toHaveBeenCalledWith(["15m", "1h"]);
        expect(textInput()?.value).toBe("");
    });

    it("ignores a timeframe already in the list", () => {
        const onchange = vi.fn();
        render({ selected: ["15m"], onchange });

        type("15M");
        pressEnter();

        expect(onchange).not.toHaveBeenCalled();
    });

    it("stops at maxItems and says so", () => {
        const onchange = vi.fn();
        render({ selected: ["5m", "15m"], maxItems: 2, onchange });

        expect(textInput()).toBeNull();
        expect(host.textContent).toContain(
            lookup("settings.indicators.maxTimeframesSelected").replace("{max}", "2"),
        );
    });

    it("adds a timeframe picked from the dropdown", () => {
        const onchange = vi.fn();
        render({ selected: [], options: ["1h", "4h"], onchange });

        type("4");
        const option = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === "4h",
        );
        expect(option).toBeTruthy();
        option?.click();

        expect(onchange).toHaveBeenCalledWith(["4h"]);
    });
});
