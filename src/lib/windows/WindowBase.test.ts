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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WindowBase } from "./WindowBase.svelte";

class TestWindow extends WindowBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get component(): any {
        return null;
    }
}

function setViewportWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        writable: true,
        configurable: true,
    });
}

let nextTestId = 0;

/** A window instance with a unique id, so tests never collide on the same
 * `cachy_win_<id>` localStorage key (WindowBase.id defaults to the window
 * type itself for single-instance types, which "window" is). */
function makeTestWindow() {
    return new TestWindow({ id: `test-window-${nextTestId++}` });
}

/** windowType 'window' is not isResponsive by registry default, so this sets
 * it after construction and re-runs the check the constructor already did
 * (harmlessly idempotent) to simulate a window whose type is responsive
 * from the start, without coupling the test to which registry types are. */
function makeResponsiveWindow(breakpoint = 768) {
    const win = makeTestWindow();
    win.isResponsive = true;
    win.edgeToEdgeBreakpoint = breakpoint;
    win.updateResponsiveState();
    return win;
}

describe("WindowBase responsive state (BUG-0043)", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    beforeEach(() => {
        localStorage.clear();
        setViewportWidth(1200);
        Object.defineProperty(window, "innerHeight", {
            value: 900,
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        setViewportWidth(originalInnerWidth);
        Object.defineProperty(window, "innerHeight", {
            value: originalInnerHeight,
            writable: true,
            configurable: true,
        });
    });

    it("auto-maximizes a responsive window when created below the breakpoint", () => {
        setViewportWidth(400);
        const win = makeResponsiveWindow();
        expect(win.isMaximized).toBe(true);
    });

    it("does not re-maximize a window the user restored while still small", () => {
        setViewportWidth(400);
        const win = makeResponsiveWindow();
        expect(win.isMaximized).toBe(true);

        // User manually restores while the viewport is still small.
        win.restore();
        expect(win.isMaximized).toBe(false);

        // Without the fix, this re-triggers the small-viewport branch and
        // re-maximizes -- exactly what a mobile browser's resize event for
        // an on-screen keyboard or address-bar collapse would do.
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(false);

        // A second resize event at the same width must not flip it back either.
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(false);
    });

    it("re-applies the responsive rule on a fresh small session after returning to a large viewport", () => {
        setViewportWidth(400);
        const win = makeResponsiveWindow();
        win.restore();
        expect(win.isMaximized).toBe(false);

        // Viewport grows past the breakpoint, then shrinks again -- this is
        // a new "small" session, so the override from before must not carry over.
        setViewportWidth(1200);
        win.updateResponsiveState();
        setViewportWidth(400);
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(true);
    });

    it("does not restore a window the user maximized by hand once the viewport grows", () => {
        setViewportWidth(1200);
        const win = makeResponsiveWindow();
        expect(win.isMaximized).toBe(false);

        // User-driven maximize, not the responsive rule.
        win.toggleMaximize();
        expect(win.isMaximized).toBe(true);

        setViewportWidth(1600);
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(true);
    });

    it("still restores a window the responsive rule maximized once the viewport grows", () => {
        setViewportWidth(400);
        const win = makeResponsiveWindow();
        expect(win.isMaximized).toBe(true);

        setViewportWidth(1200);
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(false);
    });

    it("ignores non-responsive windows entirely", () => {
        setViewportWidth(1200);
        const win = makeTestWindow();
        win.isResponsive = false;

        setViewportWidth(400);
        win.updateResponsiveState();
        expect(win.isMaximized).toBe(false);
    });
});

describe("WindowBase.handleViewportResize (BUG-0043)", () => {
    afterEach(() => {
        setViewportWidth(1200);
    });

    it("re-clamps a non-responsive window that is now outside a shrunk viewport", () => {
        setViewportWidth(1200);
        const win = makeTestWindow();
        win.isResponsive = false;
        win.width = 400;
        win.height = 300;
        win.updatePosition(1100, 50); // valid at 1200px wide

        setViewportWidth(500);
        win.handleViewportResize();

        // updatePosition's own clamp keeps at least 38% of the window
        // width visible -- at 500px viewport width the previous x=1100
        // must have been pulled back in.
        expect(win.x).toBeLessThan(500);
    });

    it("does not move a window that is already within the viewport", () => {
        setViewportWidth(1200);
        const win = makeTestWindow();
        win.isResponsive = false;
        win.width = 400;
        win.height = 300;
        win.updatePosition(100, 100);

        setViewportWidth(1200);
        win.handleViewportResize();

        expect(win.x).toBe(100);
        expect(win.y).toBe(100);
    });
});

describe("WindowBase construction does not register a per-instance resize listener (BUG-0043)", () => {
    it("adds no 'resize' listener when a window is constructed", () => {
        const addEventListenerSpy = vi.spyOn(window, "addEventListener");
        const resizeCallsBefore = addEventListenerSpy.mock.calls.filter(
            (call) => call[0] === "resize",
        ).length;

        makeTestWindow();
        makeTestWindow();
        makeTestWindow();

        const resizeCallsAfter = addEventListenerSpy.mock.calls.filter(
            (call) => call[0] === "resize",
        ).length;
        // WindowManager registers exactly one shared 'resize' listener for
        // its whole lifetime (see WindowManager.test.ts); WindowBase itself
        // must add none, however many instances are constructed.
        expect(resizeCallsAfter).toBe(resizeCallsBefore);

        addEventListenerSpy.mockRestore();
    });
});
