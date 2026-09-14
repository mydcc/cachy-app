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
 * FEAT-0346 — DepthBar turns order-book volume into one ratio. The split has
 * to come from the quantities, not the prices, and an empty book must not
 * divide by zero or claim a side.
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
    return { _: r((key: string) => lookup(key) ?? key), locale: r("en"), setLocale: vi.fn() };
});

vi.mock("../../utils/utils", () => ({
    formatDynamicDecimal: (value: { toString(): string }) => value.toString(),
}));

import DepthBar from "./DepthBar.svelte";

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

function render(props: Record<string, unknown> = {}) {
    component = mount(DepthBar, { target: host, props }) as never;
    flushSync();
}

function barWidths(): string[] {
    return [...host.querySelectorAll<HTMLElement>("div[style]")].map((el) => el.style.width);
}

describe("FEAT-0346 — DepthBar splits the book by quantity", () => {
    it("claims neither side when there is no volume", () => {
        render();

        expect(barWidths()).toEqual(["50%", "50%"]);
    });

    it("weighs bids against asks by quantity", () => {
        render({
            bids: [
                ["100", "2"],
                ["99", "1"],
            ],
            asks: [["101", "1"]],
        });

        expect(barWidths()).toEqual(["75%", "25%"]);
        expect(host.textContent).toContain("3 Bids");
        expect(host.textContent).toContain("1 Asks");
    });

    it("ignores a missing quantity instead of producing NaN", () => {
        render({ bids: [["100", ""]], asks: [["101", "4"]] });

        expect(barWidths()).toEqual(["0%", "100%"]);
    });
});
