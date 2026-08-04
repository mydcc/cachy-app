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
