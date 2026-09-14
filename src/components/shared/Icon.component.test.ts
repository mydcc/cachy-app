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
 * FEAT-0346 — Icon is the only place the app injects raw SVG. Whatever it
 * renders must have been through DOMPurify first, so the test proves the
 * sanitizer is on the path and its output — not the input — is what lands in
 * the DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

/*
 * The real DOMPurify is replaced by a fake that returns a fixed, safe node,
 * so the test can prove the component renders the sanitizer's output rather
 * than the raw string. The fake deliberately does no string filtering of its
 * own — a regex "sanitizer" here would be a CodeQL finding, not a real one.
 */
const { sanitize } = vi.hoisted(() => ({
    sanitize: vi.fn((data: string) => `<span data-sanitized data-len="${data.length}"></span>`),
}));
vi.mock("dompurify", () => ({ default: { sanitize } }));

import Icon from "./Icon.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown>) {
    component = mount(Icon, { target: host, props }) as never;
    flushSync();
}

function wrapper(): HTMLElement {
    const el = host.querySelector<HTMLElement>(".cachy-icon");
    if (!el) throw new Error("icon wrapper not rendered");
    return el;
}

describe("FEAT-0346 — Icon sanitises before injecting", () => {
    it("renders the sanitised markup, never the raw string", () => {
        render({ data: '<svg id="ok" onerror="alert(1)"></svg>' });

        expect(sanitize).toHaveBeenCalledWith('<svg id="ok" onerror="alert(1)"></svg>');
        expect(wrapper().innerHTML).toContain("data-sanitized");
        expect(wrapper().innerHTML).not.toContain("onerror");
    });

    it("applies the requested size and extra classes", () => {
        render({ data: "<svg></svg>", size: "24", class: "my-icon" });

        expect(wrapper().style.width).toBe("24px");
        expect(wrapper().style.height).toBe("24px");
        expect(wrapper().classList.contains("my-icon")).toBe(true);
    });
});
