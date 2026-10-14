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
 * FEAT-0684 — the frame's text-size control has to reach the content.
 *
 * `WindowFrame` has always applied a px `font-size` to `.window-content`, but
 * the app's type scale is the Tailwind token scale (v4 emits
 * `font-size: var(--text-sm)`), so a px size on the wrapper does not touch it:
 * the control would appear and do nothing for the prose. The frame therefore
 * also publishes `--text-scale`, the size relative to the window default, which
 * the tokens in `themes.css` multiply by. This pins both halves.
 *
 * The window used here opts into the control the same way the readers and the
 * Academy do; whether the Academy *opts in* is pinned separately in
 * `WindowRegistry.test.ts`.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowFrame from "./WindowFrame.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { DEFAULT_WINDOW_FONT_SIZE } from "../../../lib/constants";
import EmptyStub from "../../../tests/helpers/EmptyStub.svelte";

/** A window that opts into the font-size control, as the readers and the Academy do. */
class ProbeWindow extends WindowBase {
    constructor() {
        super({ title: "Probe", windowType: "guide" });
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: Record<string, unknown> | null = null;

function mountFrame(): { content: () => HTMLElement; win: WindowBase } {
    const win = new ProbeWindow();
    host = document.createElement("div");
    document.body.appendChild(host);

    component = mount(WindowFrame, { target: host, props: { window: win } }) as never;
    flushSync();

    const content = () => {
        const element = host?.querySelector<HTMLElement>(".window-content");
        if (!element) throw new Error("the frame rendered no content element");
        return element;
    };
    content();
    return { content, win };
}

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host?.remove();
    host = null;
});

describe("FEAT-0684 — the text-size control reaches the window content", () => {
    it("publishes the plain size and the scale factor the type tokens read", () => {
        const { content, win } = mountFrame();

        // At the default size the factor is exactly 1: nothing moves until the
        // trader steps it.
        expect(content().style.fontSize).toBe(`${DEFAULT_WINDOW_FONT_SIZE}px`);
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");

        // One step up: the plain size grows for text that inherits, and the
        // factor grows with it for text sized by the type scale.
        win.setFontSize(DEFAULT_WINDOW_FONT_SIZE + 1);
        flushSync();

        expect(content().style.fontSize).toBe(`${DEFAULT_WINDOW_FONT_SIZE + 1}px`);
        expect(content().style.getPropertyValue("--text-scale")).toBe(
            String((DEFAULT_WINDOW_FONT_SIZE + 1) / DEFAULT_WINDOW_FONT_SIZE),
        );
    });

    it("clamps the size the same way the control does", () => {
        const { content, win } = mountFrame();

        win.setFontSize(4);
        flushSync();
        expect(content().style.fontSize).toBe("8px");

        win.setFontSize(99);
        flushSync();
        expect(content().style.fontSize).toBe("32px");
    });
});
