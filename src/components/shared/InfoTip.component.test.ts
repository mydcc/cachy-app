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
 * FEAT-0346 — InfoTip is an "i" that carries a setting's explanation. The text
 * has to be exposed to assistive tech on the element itself, not only in the
 * hover tooltip, because a screen reader never hovers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

vi.mock("./Tooltip.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

import InfoTip from "./InfoTip.svelte";

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

describe("FEAT-0346 — InfoTip exposes its explanation", () => {
    it("labels the icon with the full text", () => {
        component = mount(InfoTip, {
            target: host,
            props: { text: "Slippage tolerance for market orders" },
        }) as never;
        flushSync();

        const tip = host.querySelector(".info-tip");
        expect(tip).toBeTruthy();
        expect(tip?.getAttribute("aria-label")).toBe(
            "Slippage tolerance for market orders",
        );
    });

    it("hides the decorative svg from screen readers", () => {
        component = mount(InfoTip, { target: host, props: { text: "Help" } }) as never;
        flushSync();

        expect(host.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    });
});
