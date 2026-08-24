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

describe("WindowBase.resolveDoubleClickAction (FEAT-0044)", () => {
    it("returns 'maximize' when doubleClickBehavior is 'maximize' and maximizing is allowed", () => {
        const win = makeTestWindow();
        win.doubleClickBehavior = "maximize";
        win.allowMaximize = true;
        expect(win.resolveDoubleClickAction()).toBe("maximize");
    });

    it("returns null for 'maximize' when maximizing is disallowed", () => {
        const win = makeTestWindow();
        win.doubleClickBehavior = "maximize";
        win.allowMaximize = false;
        expect(win.resolveDoubleClickAction()).toBeNull();
    });

    it("returns 'pin' when doubleClickBehavior is 'pin'", () => {
        const win = makeTestWindow();
        win.doubleClickBehavior = "pin";
        expect(win.resolveDoubleClickAction()).toBe("pin");
    });

    it("returns 'minimize' for a legacy persisted 'minimize' value when minimizing is allowed", () => {
        const win = makeTestWindow();
        // The type narrowed to 'maximize' | 'pin' after this value could
        // already have been written to localStorage by an older session --
        // cast past the narrowed type the same way restoreState() would
        // read it back from JSON.
        win.doubleClickBehavior = "minimize" as "maximize" | "pin";
        win.allowMinimize = true;
        expect(win.resolveDoubleClickAction()).toBe("minimize");
    });

    it("returns null for a legacy 'minimize' value when minimizing is disallowed", () => {
        const win = makeTestWindow();
        win.doubleClickBehavior = "minimize" as "maximize" | "pin";
        win.allowMinimize = false;
        expect(win.resolveDoubleClickAction()).toBeNull();
    });
});

describe("WindowBase maximizedZIndex (FEAT-0044)", () => {
    it("advances maximizedZIndex above the windowMax base on maximize()", () => {
        const win = makeTestWindow();
        const before = win.maximizedZIndex;
        win.maximize();
        expect(win.maximizedZIndex).toBeGreaterThan(before - 1);
        expect(win.maximizedZIndex).toBeGreaterThanOrEqual(1_020_000);
    });

    it("gives a later-maximized window a higher maximizedZIndex than an earlier one", () => {
        const winA = makeTestWindow();
        const winB = makeTestWindow();

        winA.maximize();
        winB.maximize();

        expect(winB.maximizedZIndex).toBeGreaterThan(winA.maximizedZIndex);
    });

    it("bumps maximizedZIndex above a sibling's when refreshed again", () => {
        const winA = makeTestWindow();
        const winB = makeTestWindow();

        winA.maximize();
        winB.maximize();
        expect(winB.maximizedZIndex).toBeGreaterThan(winA.maximizedZIndex);

        // Simulates re-focusing the already-maximized winA -- without a
        // fresh refresh it would remain stuck behind winB.
        winA.refreshMaximizedZIndex();
        expect(winA.maximizedZIndex).toBeGreaterThan(winB.maximizedZIndex);
    });
});

describe("WindowBase.restoreState tolerates unknown persisted fields (FEAT-0044)", () => {
    it("restores known fields and ignores a field the current type no longer allows", () => {
        const id = `test-window-legacy-${nextTestId++}`;
        localStorage.setItem(
            `cachy_win_${id}`,
            JSON.stringify({
                x: 42,
                y: 24,
                width: 500,
                height: 400,
                isMaximized: false,
                isMinimized: false,
                isPinned: false,
                pinSide: "none",
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "BTCUSDT",
                // Simulates a field a past schema persisted that the
                // current WindowSerializedState/persistedSnapshot shape no
                // longer has any concept of -- restoreState() must not
                // throw or otherwise choke on it.
                legacyBurnLayer: "modals",
            }),
        );

        const win = new TestWindow({ id });

        expect(win.x).toBe(42);
        expect(win.y).toBe(24);
        expect(win.width).toBe(500);
        expect(win.symbol).toBe("BTCUSDT");
    });
});

describe("WindowBase.showBackdrop (FEAT-0044)", () => {
    it("defaults to false for a window type with no showBackdrop flag", () => {
        const win = makeTestWindow();
        expect(win.showBackdrop).toBe(false);
    });
});

describe("WindowBase.updatePosition viewport clamping (FEAT-0050)", () => {
    beforeEach(() => {
        setViewportWidth(1200);
        Object.defineProperty(window, "innerHeight", {
            value: 900,
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        setViewportWidth(1200);
    });

    it("clamps the left edge: at least 38% of the window stays on screen", () => {
        const win = makeTestWindow();
        win.width = 400;
        win.updatePosition(-10000, 100);
        // minX = -(width - width*0.38) = -(400 - 152) = -248
        expect(win.x).toBe(-248);
    });

    it("clamps the right edge: at least 38% of the window stays on screen", () => {
        const win = makeTestWindow();
        win.width = 400;
        win.updatePosition(10000, 100);
        // maxX = screenWidth - width*0.38 = 1200 - 152 = 1048
        expect(win.x).toBe(1048);
    });

    it("clamps the top edge: the header (y) never goes negative", () => {
        const win = makeTestWindow();
        win.updatePosition(100, -500);
        expect(win.y).toBe(0);
    });

    it("clamps the bottom edge: at least 38% of the window stays on screen", () => {
        const win = makeTestWindow();
        win.height = 300;
        win.updatePosition(100, 10000);
        // maxY = screenHeight - height*0.38 = 900 - 114 = 786
        expect(win.y).toBe(786);
    });

    it("does not move a maximized window", () => {
        const win = makeTestWindow();
        win.maximize();
        const { x, y } = win;
        win.updatePosition(9999, 9999);
        expect(win.x).toBe(x);
        expect(win.y).toBe(y);
    });
});

describe("WindowBase.updateSize (FEAT-0050)", () => {
    it("clamps width below minWidth up to minWidth", () => {
        const win = makeTestWindow();
        win.minWidth = 200;
        win.updateSize(50, 400);
        expect(win.width).toBe(200);
    });

    it("clamps height below minHeight up to minHeight", () => {
        const win = makeTestWindow();
        win.minHeight = 150;
        win.updateSize(400, 50);
        expect(win.height).toBe(150);
    });

    it("derives height from width and aspectRatio when one is set", () => {
        const win = makeTestWindow();
        win.aspectRatio = 2; // 2:1
        win.updateSize(800, 999 /* ignored -- aspectRatio drives height */);
        // height = round(width / ratio) + HEADER_HEIGHT(41)
        expect(win.width).toBe(800);
        expect(win.height).toBe(Math.round(800 / 2) + 41);
    });

    it("does not resize a maximized window", () => {
        const win = makeTestWindow();
        win.maximize();
        const { width, height } = win;
        win.updateSize(999, 999);
        expect(win.width).toBe(width);
        expect(win.height).toBe(height);
    });
});

describe("WindowBase construction ordering: restoreState before updateResponsiveState (FEAT-0050)", () => {
    afterEach(() => {
        setViewportWidth(1200);
    });

    it("lets the responsive rule override a persisted non-maximized state on a small viewport", () => {
        // This exercises the real constructor order end to end -- 'modal'
        // is isResponsive/edgeToEdgeBreakpoint: 768 by registry default
        // (WindowRegistry.svelte.ts), so unlike makeResponsiveWindow() this
        // doesn't need to toggle isResponsive after the fact. If
        // updateResponsiveState() ran before restoreState() (the reverse of
        // the actual order in WindowBase's constructor), the persisted
        // isMaximized: false read by restoreState() would be the last write
        // and the window would incorrectly end up not maximized despite the
        // small viewport -- BUG-0043's whole fix depends on restoreState()
        // running first.
        const id = `ordering-test-${nextTestId++}`;
        localStorage.setItem(
            `cachy_win_${id}`,
            JSON.stringify({
                x: 100,
                y: 100,
                width: 400,
                height: 300,
                isMaximized: false,
                isMinimized: false,
            }),
        );

        setViewportWidth(400);
        const win = new TestWindow({ id, windowType: "modal" });

        expect(win.isMaximized).toBe(true);
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

describe("WindowBase 62% visibility invariant", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    function setViewportHeight(height: number) {
        Object.defineProperty(window, "innerHeight", {
            value: height,
            writable: true,
            configurable: true,
        });
    }

    /** At least 38% of the body must stay inside the viewport on both axes,
     * otherwise the user cannot grab the window header to move it back. */
    function expectWithinVisibilityInvariant(win: InstanceType<typeof TestWindow>) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const visibleWidth =
            Math.min(win.x + win.width, vw) - Math.max(win.x, 0);
        const visibleHeight =
            Math.min(win.y + win.height, vh) - Math.max(win.y, 0);
        expect(visibleWidth).toBeGreaterThanOrEqual(win.width * 0.38 - 0.001);
        expect(visibleHeight).toBeGreaterThanOrEqual(win.height * 0.38 - 0.001);
    }

    beforeEach(() => {
        localStorage.clear();
        setViewportWidth(1200);
        setViewportHeight(900);
    });

    afterEach(() => {
        setViewportWidth(originalInnerWidth);
        setViewportHeight(originalInnerHeight);
    });

    it("re-clamps geometry restored from maximization after the viewport shrank", () => {
        const win = makeTestWindow();
        win.width = 400;
        win.height = 300;
        // Fully valid position on the initial 1200x900 viewport.
        win.updatePosition(1150, 880);
        win.maximize();

        // Browser window resized while the window was maximized.
        setViewportWidth(600);
        setViewportHeight(400);

        win.restore();

        // updatePosition's clamp: maxX = 600 - 400*0.38 = 448,
        // maxY = 400 - 300*0.38 = 286. Without the re-clamp, restore()
        // would put the window back at its stale pre-maximize spot,
        // entirely (x) / mostly (y) outside the shrunken viewport.
        expect(win.isMaximized).toBe(false);
        expect(win.x).toBe(448);
        expect(win.y).toBe(286);
        expectWithinVisibilityInvariant(win);
    });

    it("keeps a restored window untouched when the viewport did not move it out of bounds", () => {
        const win = makeTestWindow();
        win.width = 400;
        win.height = 300;
        win.updatePosition(100, 100);
        win.maximize();
        win.restore();

        expect(win.x).toBe(100);
        expect(win.y).toBe(100);
    });

    it("never spawns a fresh window with more than 62% of its body off-screen", () => {
        // Deliberately tiny viewport. Windows are sized so that 38% of each
        // axis physically fits into it -- the invariant cannot hold for a
        // window wider than the viewport itself, which is a sizing concern,
        // not a positioning one.
        setViewportWidth(320);
        setViewportHeight(480);

        // More instances than the stagger cycle (10) wraps positions around;
        // every spawn path (centering, stagger, registry layout) must run
        // through the same clamp to satisfy the rule.
        for (let i = 0; i < 14; i++) {
            const win = new TestWindow({
                id: `test-window-${nextTestId++}`,
                width: 200,
                height: 120,
            });
            expectWithinVisibilityInvariant(win);
        }
    });
});
