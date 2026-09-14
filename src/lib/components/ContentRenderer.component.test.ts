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
 * FEAT-0346 — ContentRenderer injects instruction HTML. Provided content goes
 * through DOMPurify before it reaches the DOM; a slug is fetched instead, and
 * showing a real error beats an empty page when that fetch fails.
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

const { sanitize } = vi.hoisted(() => ({ sanitize: vi.fn((html: string) => html) }));
vi.mock("dompurify", () => ({ default: { sanitize } }));

const { loadInstruction } = vi.hoisted(() => ({ loadInstruction: vi.fn() }));
vi.mock("../../services/markdownLoader", () => ({ loadInstruction }));

import ContentRenderer from "./ContentRenderer.svelte";

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

describe("FEAT-0346 — ContentRenderer sanitises and handles load failure", () => {
    it("sanitises provided content before rendering it", () => {
        component = mount(ContentRenderer, {
            target: host,
            props: { content: '<p onclick="x()">Hi</p>' },
        }) as never;
        flushSync();

        expect(sanitize).toHaveBeenCalledWith('<p onclick="x()">Hi</p>');
        expect(host.querySelector(".content-renderer")?.innerHTML).toContain("<p");
    });

    it("fetches by slug and renders the loaded html", async () => {
        loadInstruction.mockResolvedValueOnce({ html: "<p>Loaded guide</p>" });
        component = mount(ContentRenderer, {
            target: host,
            props: { slug: "guide", lang: "en" },
        }) as never;

        await vi.waitFor(() => expect(loadInstruction).toHaveBeenCalledWith("guide", "en"));
        await vi.waitFor(() => expect(host.textContent).toContain("Loaded guide"));
    });

    it("shows an error instead of a blank page when the fetch fails", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        loadInstruction.mockRejectedValueOnce(new Error("network"));
        component = mount(ContentRenderer, {
            target: host,
            props: { slug: "changelog", lang: "en" },
        }) as never;

        await vi.waitFor(() => expect(host.textContent).toContain("Failed to load content."));
        errorSpy.mockRestore();
    });
});
