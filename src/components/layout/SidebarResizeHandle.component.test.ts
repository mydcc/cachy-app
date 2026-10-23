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

/**
 * FEAT-0617 — the width is a persisted preference, so the separator must not
 * be pointer-only. These tests pin the keyboard path and the reset, which are
 * the two ways to reach a width without a precise drag.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import SidebarResizeHandle from "./SidebarResizeHandle.svelte";

interface RenderOptions {
    width?: number;
    defaultWidth?: number;
}

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

function render(options: RenderOptions = {}) {
    const onResize = vi.fn();
    const onCommit = vi.fn();

    component = mount(SidebarResizeHandle, {
        target: host,
        props: {
            width: options.width ?? 400,
            min: 280,
            max: 640,
            step: 16,
            defaultWidth: options.defaultWidth ?? 384,
            label: "Sidebar width",
            resetLabel: "Reset sidebar width",
            onResize,
            onCommit,
        },
    }) as never;
    flushSync();

    return { onResize, onCommit };
}

function separator(): HTMLElement {
    const element = host.querySelector<HTMLElement>('[role="separator"]');
    if (!element) throw new Error("separator was not rendered");
    return element;
}

function resetButton(): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>("button.sidebar-reset");
}

function press(key: string) {
    separator().dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
    flushSync();
}

describe("SidebarResizeHandle (FEAT-0617)", () => {
    it("exposes the window-splitter state to assistive tech", () => {
        render({ width: 400 });

        expect(separator().getAttribute("aria-valuenow")).toBe("400");
        expect(separator().getAttribute("aria-valuemin")).toBe("280");
        expect(separator().getAttribute("aria-valuemax")).toBe("640");
        expect(separator().getAttribute("aria-orientation")).toBe("vertical");
    });

    it("moves one step per arrow key and commits it", () => {
        const { onResize, onCommit } = render({ width: 400 });

        press("ArrowRight");

        expect(onResize).toHaveBeenCalledWith(416);
        expect(onCommit).toHaveBeenCalledWith(416);
    });

    it("stops at the bounds instead of committing an out-of-range width", () => {
        const { onCommit } = render({ width: 640 });

        press("ArrowRight");

        expect(onCommit).toHaveBeenCalledWith(640);
    });

    it("jumps to the bounds with Home and End", () => {
        const { onCommit } = render({ width: 400 });

        press("Home");
        expect(onCommit).toHaveBeenLastCalledWith(280);

        press("End");
        expect(onCommit).toHaveBeenLastCalledWith(640);
    });

    it("ignores keys that are not part of the pattern", () => {
        const { onResize, onCommit } = render({ width: 400 });

        press("PageUp");

        expect(onResize).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it("hides reset while the width is the default", () => {
        render({ width: 384, defaultWidth: 384 });
        expect(resetButton()).toBeNull();
    });

    it("offers reset once the width differs from the default", () => {
        render({ width: 420, defaultWidth: 384 });
        expect(resetButton()).not.toBeNull();
    });

    it("restores the default width from the reset button", () => {
        const { onResize, onCommit } = render({ width: 420 });

        resetButton()?.click();
        flushSync();

        expect(onResize).toHaveBeenCalledWith(384);
        expect(onCommit).toHaveBeenCalledWith(384);
    });

    it("keeps the reset in the tab order", () => {
        render({ width: 420 });

        const button = resetButton();
        expect(button).not.toBeNull();
        expect(button?.tagName).toBe("BUTTON");
        expect(button?.getAttribute("tabindex")).not.toBe("-1");
    });
});
