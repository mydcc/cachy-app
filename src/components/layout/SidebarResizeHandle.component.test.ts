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
 * be pointer-only. These tests pin the keyboard path, the pointer path and the
 * reset, which are the three ways to reach a width without a precise drag.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import SidebarResizeHandle from "./SidebarResizeHandle.svelte";

interface RenderOptions {
    width?: number;
    min?: number;
    max?: number;
    showReset?: boolean;
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
    const onCancel = vi.fn();

    component = mount(SidebarResizeHandle, {
        target: host,
        props: {
            width: options.width ?? 400,
            min: options.min ?? 280,
            max: options.max ?? 640,
            step: 16,
            defaultWidth: 384,
            showReset: options.showReset ?? true,
            label: "Sidebar width",
            resetLabel: "Reset sidebar width",
            onResize,
            onCommit,
            onCancel,
        },
    }) as never;
    flushSync();

    return { onResize, onCommit, onCancel };
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

function pointer(
    target: HTMLElement | Window,
    type: string,
    options: PointerEventInit = {},
) {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            ...options,
        }),
    );
    flushSync();
}

describe("SidebarResizeHandle (FEAT-0617)", () => {
    it("exposes the window-splitter state to assistive tech", () => {
        render({ width: 400 });

        expect(separator().getAttribute("aria-valuenow")).toBe("400");
        expect(separator().getAttribute("aria-valuetext")).toBe("400 px");
        expect(separator().getAttribute("aria-valuemin")).toBe("280");
        expect(separator().getAttribute("aria-valuemax")).toBe("640");
        expect(separator().getAttribute("aria-orientation")).toBe("vertical");
    });

    it("is focusable and keeps the tab stop", () => {
        render({ width: 400 });

        expect(separator().tabIndex).toBe(0);
        separator().focus();
        expect(document.activeElement).toBe(separator());
    });

    it("does not render a separator when the track has no range", () => {
        render({ min: 208, max: 208 });

        expect(host.querySelector('[role="separator"]')).toBeNull();
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

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(640);
        expect(onCommit).not.toHaveBeenCalledWith(656);
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

    it("drags, previews on move and commits once on release", () => {
        const { onResize, onCommit } = render({ width: 400 });
        const handle = separator();

        pointer(handle, "pointerdown", { clientX: 100, button: 0 });
        pointer(window, "pointermove", { clientX: 160 });
        pointer(window, "pointerup", { clientX: 160 });

        expect(onResize).toHaveBeenLastCalledWith(460);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(460);
    });

    it("focuses the separator on pointerdown so the keyboard works afterwards", () => {
        render({ width: 400 });

        pointer(separator(), "pointerdown", { clientX: 100, button: 0 });

        expect(document.activeElement).toBe(separator());
    });

    it("clamps the drag at the layout maximum", () => {
        const { onResize } = render({ width: 400 });

        pointer(separator(), "pointerdown", { clientX: 100, button: 0 });
        pointer(window, "pointermove", { clientX: 2_000 });

        expect(onResize).toHaveBeenLastCalledWith(640);
    });

    it("ignores a non-primary button", () => {
        const { onResize, onCommit } = render({ width: 400 });

        pointer(separator(), "pointerdown", { clientX: 100, button: 2 });
        pointer(window, "pointermove", { clientX: 160 });
        pointer(window, "pointerup", { clientX: 160 });

        expect(onResize).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it("cancels the preview when the control unmounts mid-drag", () => {
        const { onCancel } = render({ width: 400 });

        pointer(separator(), "pointerdown", { clientX: 100, button: 0 });
        unmount(component as never);
        component = null;

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("reverts instead of committing when the gesture is cancelled", () => {
        const { onCommit, onCancel } = render({ width: 400 });

        pointer(separator(), "pointerdown", { clientX: 100, button: 0 });
        pointer(window, "pointermove", { clientX: 160 });
        pointer(window, "pointercancel", { clientX: 160 });

        expect(onCommit).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("hides reset while the stored width is the default", () => {
        render({ width: 384, showReset: false });
        expect(resetButton()).toBeNull();
    });

    it("offers reset once the stored width differs from the default", () => {
        render({ width: 420, showReset: true });
        expect(resetButton()).not.toBeNull();
    });

    it("restores the default width and returns focus to the separator", () => {
        const { onResize, onCommit } = render({ width: 420 });

        resetButton()?.click();
        flushSync();

        expect(onResize).toHaveBeenCalledWith(384);
        expect(onCommit).toHaveBeenCalledWith(384);
        expect(document.activeElement).toBe(separator());
    });

    it("keeps the reset enabled and in the tab order", () => {
        render({ width: 420 });

        const button = resetButton();
        expect(button).not.toBeNull();
        expect(button?.tagName).toBe("BUTTON");
        expect(button?.disabled).toBe(false);
        expect(button?.tabIndex).toBe(0);
    });
});
