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
 * FEAT-0346 — SettingsGrid is the single definition of how settings fields
 * flow into columns. Its own header comment makes two promises worth a test:
 * below the container threshold everything is one column, and the wider
 * threshold only exists for the three-column variant.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync, createRawSnippet } from "svelte";

import SettingsGrid from "./SettingsGrid.svelte";

const children = createRawSnippet(() => ({
    render: () => `<span data-testid="grid-child">field</span>`,
}));

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
    component = mount(SettingsGrid, { target: host, props: { children, ...props } }) as never;
    flushSync();
}

function grid(): HTMLElement {
    const el = host.querySelector<HTMLElement>("div");
    if (!el) throw new Error("grid not rendered");
    return el;
}

describe("FEAT-0346 — SettingsGrid keeps column rules in one place", () => {
    it("starts at one column and expands to two at the container threshold", () => {
        render();

        expect(grid().className).toContain("grid-cols-1");
        expect(grid().className).toContain("@min-[560px]:grid-cols-2");
        expect(grid().className).not.toContain("grid-cols-3");
    });

    it("adds the third column only in the three-column variant", () => {
        render({ cols: 3 });

        expect(grid().className).toContain("@min-[560px]:grid-cols-2");
        expect(grid().className).toContain("@min-[960px]:grid-cols-3");
    });

    it("applies the gap and the caller's escape hatch", () => {
        render({ gap: "gap-6", extraClass: "mb-4" });

        expect(grid().className).toContain("gap-6");
        expect(grid().className).toContain("mb-4");
    });

    it("renders its children", () => {
        render();

        expect(host.querySelector('[data-testid="grid-child"]')?.textContent).toBe("field");
    });
});
