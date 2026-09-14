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
 * FEAT-0346 — ModalFrameContent is the render target every modal snippet lands
 * in (FEAT-0044). It owns no scroll container by design; its only contract is
 * to render the snippet in a body div carrying the caller's body class.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync, createRawSnippet } from "svelte";

import ModalFrameContent from "./ModalFrameContent.svelte";

const children = createRawSnippet(() => ({
    render: () => `<p data-testid="modal-child">content</p>`,
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
    component = mount(ModalFrameContent, { target: host, props }) as never;
    flushSync();
}

function body(): HTMLElement {
    const el = host.querySelector<HTMLElement>(".modal-frame-body");
    if (!el) throw new Error("modal body not rendered");
    return el;
}

describe("FEAT-0346 — ModalFrameContent renders the modal snippet", () => {
    it("renders the passed snippet", () => {
        render({ children });

        expect(host.querySelector('[data-testid="modal-child"]')?.textContent).toBe("content");
        expect(body()).toBeTruthy();
    });

    it("carries the caller's body class", () => {
        render({ children, bodyClass: "p-0 overflow-visible" });

        expect(body().className).toContain("p-0");
        expect(body().className).toContain("overflow-visible");
    });

    it("renders an empty body without a snippet", () => {
        render();

        expect(body().textContent?.trim()).toBe("");
    });
});
