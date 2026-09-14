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
 * FEAT-0346 — Button is the app's button primitive. It has to forward its
 * label to both `title` and `aria-label` so an icon-only button is still
 * named, and a disabled button must not fire.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync, createRawSnippet } from "svelte";

import Button from "./Button.svelte";

const children = createRawSnippet(() => ({
    render: () => `<span data-testid="child">Click me</span>`,
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
    component = mount(Button, { target: host, props: { children, ...props } }) as never;
    flushSync();
}

function button(): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>("button");
    if (!el) throw new Error("button not rendered");
    return el;
}

describe("FEAT-0346 — Button forwards its label and honours disabled", () => {
    it("renders its children and fires onClick", () => {
        const onClick = vi.fn();
        render({ onClick });

        expect(host.querySelector('[data-testid="child"]')?.textContent).toBe("Click me");
        button().click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("names the button from its title when no aria-label is given", () => {
        render({ title: "Save preset" });

        expect(button().getAttribute("title")).toBe("Save preset");
        expect(button().getAttribute("aria-label")).toBe("Save preset");
    });

    it("prefers an explicit aria-label over the title", () => {
        render({ title: "Save", ariaLabel: "Save the active preset" });

        expect(button().getAttribute("aria-label")).toBe("Save the active preset");
    });

    it("does not fire while disabled", () => {
        const onClick = vi.fn();
        render({ onClick, disabled: true });

        expect(button().disabled).toBe(true);
        button().click();
        expect(onClick).not.toHaveBeenCalled();
    });

    it("applies caller classes", () => {
        render({ extraClasses: "my-custom-class" });

        expect(button().classList.contains("my-custom-class")).toBe(true);
    });
});
