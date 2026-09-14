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
 * FEAT-0346 — CachyIcon is the brand mark. It must always be a named image for
 * assistive tech: a caller-supplied label wins, otherwise the translated
 * fallback names it "Cachy Logo".
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

import CachyIcon from "./CachyIcon.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function svg(): SVGElement {
    const el = host.querySelector<SVGElement>("svg");
    if (!el) throw new Error("svg not rendered");
    return el;
}

describe("FEAT-0346 — CachyIcon is always a named image", () => {
    it("falls back to the translated brand name", () => {
        component = mount(CachyIcon, { target: host }) as never;
        flushSync();

        expect(svg().getAttribute("role")).toBe("img");
        expect(svg().getAttribute("aria-label")).toBe(lookup("common.cachyLogo"));
        expect(svg().querySelector("title")?.textContent).toBe(lookup("common.cachyLogo"));
    });

    it("prefers a caller-supplied label and title", () => {
        component = mount(CachyIcon, {
            target: host,
            props: { ariaLabel: "Cachy home", title: "Go home" },
        }) as never;
        flushSync();

        expect(svg().getAttribute("aria-label")).toBe("Cachy home");
        expect(svg().querySelector("title")?.textContent).toBe("Go home");
    });

    it("spreads arbitrary attributes onto the svg", () => {
        component = mount(CachyIcon, { target: host, props: { class: "h-8 w-8" } }) as never;
        flushSync();

        expect(svg().classList.contains("h-8")).toBe(true);
        expect(svg().classList.contains("w-8")).toBe(true);
    });
});
