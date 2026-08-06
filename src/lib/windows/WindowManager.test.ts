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

import { describe, it, expect, vi, afterEach } from "vitest";
import { windowManager } from "./WindowManager.svelte";
import { WindowBase } from "./WindowBase.svelte";

class TestWindow extends WindowBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get component(): any {
        return null;
    }
}

let nextTestId = 0;
const openedIds: string[] = [];

function openTestWindow() {
    const win = new TestWindow({ id: `manager-test-window-${nextTestId++}` });
    // windowType 'window' defaults allowMultipleInstances to false, under
    // which WindowManager.open() treats a second instance as a duplicate
    // and just focuses the first one instead of registering it -- these
    // tests need several independent windows open at once.
    win.allowMultipleInstances = true;
    windowManager.open(win);
    openedIds.push(win.id);
    return win;
}

afterEach(() => {
    while (openedIds.length) {
        windowManager.close(openedIds.pop()!);
    }
});

describe("WindowManager Escape-to-close (FEAT-0044)", () => {
    // Only one closeOnBlur window is ever set up per test here: opening a
    // *second* one through openTestWindow()/open() would immediately close
    // the first via bringToFront()'s own "close other closeOnBlur windows"
    // cleanup (pre-existing behavior, originally for transient windows like
    // the Symbol Selector) -- so two closeOnBlur windows never actually
    // coexist in practice, and a test pretending otherwise would be testing
    // an unreachable state.
    it("closes a closeOnBlur window on Escape, leaving a non-dismissible window open", () => {
        const w1 = openTestWindow();
        const w2 = openTestWindow();
        w2.closeOnBlur = true;

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(windowManager.isOpen(w2.id)).toBe(false);
        expect(windowManager.isOpen(w1.id)).toBe(true);
        openedIds.splice(openedIds.indexOf(w2.id), 1);
    });

    it("does nothing when no open window has closeOnBlur set", () => {
        const w1 = openTestWindow();

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

        expect(windowManager.isOpen(w1.id)).toBe(true);
    });

    it("does not close anything on a non-Escape key", () => {
        const w1 = openTestWindow();
        w1.closeOnBlur = true;

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        expect(windowManager.isOpen(w1.id)).toBe(true);
    });
});

describe("WindowManager.bringToFront and maximized windows (FEAT-0044)", () => {
    it("reorders two maximized windows so the one brought to front has the higher maximizedZIndex", () => {
        const w1 = openTestWindow();
        const w2 = openTestWindow();
        w1.maximize();
        w2.maximize();
        expect(w2.maximizedZIndex).toBeGreaterThan(w1.maximizedZIndex);

        windowManager.bringToFront(w1.id);

        expect(w1.maximizedZIndex).toBeGreaterThan(w2.maximizedZIndex);
    });

    it("does not touch maximizedZIndex for a non-maximized window", () => {
        const w1 = openTestWindow();
        const before = w1.maximizedZIndex;

        windowManager.bringToFront(w1.id);

        expect(w1.maximizedZIndex).toBe(before);
    });
});

describe("WindowManager resize handling (BUG-0043)", () => {
    it("calls handleViewportResize on every open window when the viewport resizes", () => {
        const w1 = openTestWindow();
        const w2 = openTestWindow();

        const spy1 = vi.spyOn(w1, "handleViewportResize");
        const spy2 = vi.spyOn(w2, "handleViewportResize");

        window.dispatchEvent(new Event("resize"));

        expect(spy1).toHaveBeenCalledTimes(1);
        expect(spy2).toHaveBeenCalledTimes(1);
    });

    it("does not call handleViewportResize on a window after it is closed", () => {
        const w1 = openTestWindow();
        const spy = vi.spyOn(w1, "handleViewportResize");

        windowManager.close(w1.id);
        openedIds.splice(openedIds.indexOf(w1.id), 1);

        window.dispatchEvent(new Event("resize"));

        expect(spy).not.toHaveBeenCalled();
    });

    it("registers exactly one 'resize' listener regardless of how many windows are open", () => {
        // windowManager is a singleton constructed once at module load, so
        // its own registration already happened; what this guards against
        // is a per-window registration creeping back in (BUG-0043's actual
        // defect). Opening several windows must add zero further
        // window-level 'resize' listeners -- WindowBase.test.ts proves that
        // constructing a WindowBase adds none, and this proves opening one
        // through the manager doesn't either.
        const addEventListenerSpy = vi.spyOn(window, "addEventListener");
        const before = addEventListenerSpy.mock.calls.filter(
            (call) => call[0] === "resize",
        ).length;

        openTestWindow();
        openTestWindow();
        openTestWindow();

        const after = addEventListenerSpy.mock.calls.filter(
            (call) => call[0] === "resize",
        ).length;
        expect(after).toBe(before);

        addEventListenerSpy.mockRestore();
    });
});
