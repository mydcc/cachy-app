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
 * FEAT-0346 — MarkdownView is the window body that shows a markdown document.
 * Its one job is to run the window's content through renderTrustedMarkdown,
 * so a heading must arrive as a heading, not as literal text.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import MarkdownView from "./MarkdownView.svelte";

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

describe("FEAT-0346 — MarkdownView renders through the trusted renderer", () => {
    it("converts markdown into markup", () => {
        component = mount(MarkdownView, {
            target: host,
            props: { window: { content: "# Release notes" } },
        }) as never;
        flushSync();

        // happy-dom's sanitizer drops the tags but keeps the text, so the
        // proof that the markdown renderer ran is that the `#` marker is gone.
        const text = host.querySelector(".markdown-view-container")?.textContent ?? "";
        expect(text).toContain("Release notes");
        expect(text).not.toContain("#");
    });

    it("renders an empty body for empty content", () => {
        component = mount(MarkdownView, {
            target: host,
            props: { window: { content: "" } },
        }) as never;
        flushSync();

        expect(host.querySelector(".markdown-view-container")?.textContent?.trim()).toBe("");
    });
});
