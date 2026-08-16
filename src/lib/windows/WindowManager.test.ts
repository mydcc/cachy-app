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
import { windowManager, SAVE_DEBOUNCE_MS } from "./WindowManager.svelte";
import { WindowBase } from "./WindowBase.svelte";
import { Z_LAYERS, MAX_SAFE_WINDOW_Z_INDEX } from "./zLayers";

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

describe("WindowManager.openAcademy (FEAT-0045)", () => {
    afterEach(() => {
        windowManager.close("academy");
    });

    it("focuses the existing academy window instead of duplicating it on a second call", async () => {
        await windowManager.openAcademy();
        const firstCount = windowManager.windows.filter(
            (w) => w.windowType === "academy",
        ).length;
        await windowManager.openAcademy();
        const secondCount = windowManager.windows.filter(
            (w) => w.windowType === "academy",
        ).length;

        expect(firstCount).toBe(1);
        expect(secondCount).toBe(1);
    });

    it("is closeable via its fixed 'academy' id", async () => {
        await windowManager.openAcademy();
        expect(windowManager.isOpen("academy")).toBe(true);

        windowManager.close("academy");
        expect(windowManager.isOpen("academy")).toBe(false);
    });
});

describe("WindowManager capacity limit (FEAT-0050)", () => {
    it("evicts the oldest window once the 20-window cap is hit", () => {
        const wins = Array.from({ length: 20 }, () => openTestWindow());
        expect(windowManager.isOpen(wins[0].id)).toBe(true);

        const w21 = openTestWindow();

        expect(windowManager.isOpen(wins[0].id)).toBe(false);
        expect(windowManager.isOpen(w21.id)).toBe(true);
        expect(windowManager.windows.length).toBe(20);
        openedIds.splice(openedIds.indexOf(wins[0].id), 1);
    });

    it("does not evict the currently focused window even if it is the oldest", () => {
        const wins = Array.from({ length: 20 }, () => openTestWindow());
        // Re-focus the oldest window -- bringToFront() changes its zIndex
        // but not its position in the manager's internal list, so a naive
        // "evict index 0" strategy would still pick it even though it's the
        // one currently in front.
        windowManager.bringToFront(wins[0].id);

        const w21 = openTestWindow();

        expect(windowManager.isOpen(wins[0].id)).toBe(true);
        expect(windowManager.isOpen(w21.id)).toBe(true);
        openedIds.splice(openedIds.indexOf(wins[0].id), 1);
        windowManager.close(wins[0].id);
    });
});

describe("WindowManager news window limit (max 6 simultaneously)", () => {
    function openTestNewsWindow() {
        const win = new TestWindow({
            id: `news-test-window-${nextTestId++}`,
            windowType: "iframe",
            storageKey: "news_article",
        });
        win.allowMultipleInstances = true;
        windowManager.open(win);
        openedIds.push(win.id);
        return win;
    }

    it("evicts the oldest/bottom news window when a 7th news window is opened", () => {
        const newsWins = Array.from({ length: 6 }, () => openTestNewsWindow());
        expect(newsWins.every(w => windowManager.isOpen(w.id))).toBe(true);

        const seventhNews = openTestNewsWindow();

        // Oldest news window (newsWins[0]) should have been closed
        expect(windowManager.isOpen(newsWins[0].id)).toBe(false);
        expect(windowManager.isOpen(seventhNews.id)).toBe(true);
        const openNews = windowManager.windows.filter(w => w.windowType === "iframe");
        expect(openNews.length).toBe(6);
    });
});

describe("WindowManager z-index stays inside the 'window' layer (FEAT-0050)", () => {
    it("assigns a floating window a zIndex inside [Z_LAYERS.window, Z_LAYERS.windowDock)", () => {
        const w1 = openTestWindow();

        expect(w1.zIndex).toBeGreaterThanOrEqual(Z_LAYERS.window);
        expect(w1.zIndex).toBeLessThan(Z_LAYERS.windowDock);
    });

    it("normalizes back inside the layer once the counter approaches the unsafe ceiling", () => {
        const w1 = openTestWindow();
        const w2 = openTestWindow();

        // Force the shared counter to the edge documented in zLayers.ts's
        // own comment (MAX_SAFE_WINDOW_Z_INDEX must stay below
        // Z_LAYERS.windowDock) rather than looping bringToFront() ~989,000
        // times to reach it for real.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (windowManager as any)._nextZIndex = MAX_SAFE_WINDOW_Z_INDEX + 1;

        windowManager.bringToFront(w2.id);

        expect(w2.zIndex).toBeGreaterThanOrEqual(Z_LAYERS.window);
        expect(w2.zIndex).toBeLessThan(Z_LAYERS.windowDock);
        // Relative order survives the reset: the window not just brought to
        // front stays behind the one that was.
        expect(w2.zIndex).toBeGreaterThan(w1.zIndex);
    });
});

describe("WindowManager.isOpen (FEAT-0050)", () => {
    it("returns false for an id that matches no open window, without throwing", () => {
        // The failure mode behind FEAT-0044's dead windowManager.isOpen("academy")
        // branch: calling isOpen() with an id nothing currently open has.
        expect(() => windowManager.isOpen("does-not-exist")).not.toThrow();
        expect(windowManager.isOpen("does-not-exist")).toBe(false);
    });

    it("returns true once a window with that id is open, false after it closes", () => {
        const w1 = openTestWindow();
        expect(windowManager.isOpen(w1.id)).toBe(true);

        windowManager.close(w1.id);
        openedIds.splice(openedIds.indexOf(w1.id), 1);

        expect(windowManager.isOpen(w1.id)).toBe(false);
    });
});

describe("WindowManager.saveSession (FEAT-0050)", () => {
    afterEach(() => {
        vi.useRealTimers();
        sessionStorage.removeItem("cachy_open_windows");
    });

    it("debounces: nothing is written until SAVE_DEBOUNCE_MS has passed", () => {
        vi.useFakeTimers();
        sessionStorage.removeItem("cachy_open_windows");

        const w1 = openTestWindow();
        expect(sessionStorage.getItem("cachy_open_windows")).toBeNull();

        vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);

        const saved = sessionStorage.getItem("cachy_open_windows");
        expect(saved).not.toBeNull();
        const parsed = JSON.parse(saved!) as { id: string }[];
        expect(parsed.some((w) => w.id === w1.id)).toBe(true);
    });

    it("collapses several rapid opens into a single pending timer, not one per open", () => {
        // Counting sessionStorage.setItem calls directly is fragile here --
        // other suites in this file open/close windows using real timers
        // whose saves can still be in flight when this test's fake-timer
        // window starts. Asserting on the pending-timer count instead tests
        // the actual debounce mechanism (each saveSession() call clears the
        // previous timer before scheduling a new one) without depending on
        // what else is mid-flight.
        vi.useFakeTimers();
        const before = vi.getTimerCount();

        openTestWindow();
        const afterOne = vi.getTimerCount();
        openTestWindow();
        openTestWindow();
        const afterThree = vi.getTimerCount();

        // Opening the first window adds exactly one new pending timer (its
        // debounced save); opening two more must not add two more on top --
        // each call cancels the previous save's timer before scheduling its
        // own.
        expect(afterOne).toBe(before + 1);
        expect(afterThree).toBe(afterOne);
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
