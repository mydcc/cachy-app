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
 * FEAT-0685 — the frame's text-size control has to reach the content.
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
        /*
         * Set on the instance rather than inherited from a window type: the
         * constructor copies only a fixed list of options (`allowFontSize` is not
         * in it), so relying on `windowType` would make this test's precondition
         * another window's config, and its failure message would name that other
         * window.
         */
        this.allowFontSize = true;
    }

    get component() {
        return EmptyStub;
    }
}

/** A window type that never opted in. */
class PlainWindow extends WindowBase {
    constructor() {
        super({ title: "Plain", windowType: "window" });
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: Record<string, unknown> | null = null;

function mountFrame(win: WindowBase = new ProbeWindow()): {
    content: () => HTMLElement;
    win: WindowBase;
} {
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

describe("FEAT-0685 — the text-size control reaches the window content", () => {
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

    it("renders the two buttons for a window that opted in, and steps by one", () => {
        const { win } = mountFrame();
        const button = (label: string) =>
            host?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) ?? null;

        const increase = button(lookup("windows.aria.increaseFont"));
        expect(increase, "the window rendered no A+ button").not.toBeNull();
        expect(button(lookup("windows.aria.decreaseFont"))).not.toBeNull();

        const before = win.fontSize;
        increase!.click();
        flushSync();

        expect(win.fontSize).toBe(before + 1);
    });

    it("renders no control for a window that never opted in", () => {
        // The flag is the only reason the buttons exist, so an opted-out window
        // must render none — and must not scale, whatever its stored size says.
        const { content } = mountFrame(new PlainWindow());

        expect(host?.querySelector(`[aria-label="${lookup("windows.aria.increaseFont")}"]`)).toBeNull();
        expect(host?.querySelector(`[aria-label="${lookup("windows.aria.decreaseFont")}"]`)).toBeNull();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");
    });

    it("publishes a usable factor even for a size the setter would never allow", () => {
        const { content, win } = mountFrame();

        // A legacy or hand-edited store can hold anything. `NaN` is the dangerous
        // one: it is *set*, so the tokens' `var(…, 1)` fallback cannot rescue
        // them and every sized element in the window would lose its size.
        win.fontSize = Number.NaN;
        flushSync();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");

        win.fontSize = 0;
        flushSync();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");
    });
});
