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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WindowBase } from "./WindowBase.svelte";

class TestWindow extends WindowBase {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get component(): any {
        return null;
    }
}

function makeWindow(): TestWindow {
    return new TestWindow({
        title: "Snap probe",
        storageKey: "snap-test",
    });
}

function setViewport(width: number, height: number) {
    Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
        value: height,
        configurable: true,
    });
}

beforeEach(() => {
    localStorage.clear();
    setViewport(1200, 800);
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("WindowBase.snapToSide", () => {
    it("pins, tiles half the viewport and persists the geometry", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");

        expect(win.isPinned).toBe(true);
        expect(win.pinSide).toBe("left");
        expect(win.x).toBe(0);
        expect(win.y).toBe(0);
        expect(win.width).toBe(600);
        expect(win.height).toBe(800);
        expect(win.persistedSnapshot).toMatchObject({
            x: 0,
            y: 0,
            width: 600,
            height: 800,
            isPinned: true,
            pinSide: "left",
        });
    });

    it("tiles the top and bottom halves", () => {
        const top = makeWindow();
        top.snapToSide("top");
        expect(top).toMatchObject({
            isPinned: true,
            pinSide: "top",
            x: 0,
            y: 0,
            width: 1200,
            height: 400,
        });

        const bottom = makeWindow();
        bottom.snapToSide("bottom");
        expect(bottom).toMatchObject({
            isPinned: true,
            pinSide: "bottom",
            x: 0,
            y: 400,
            width: 1200,
            height: 400,
        });
    });

    it("tiles the four corners and restores the corner after a detach", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("top-left");
        expect(win).toMatchObject({
            pinSide: "top-left",
            x: 0,
            y: 0,
            width: 600,
            height: 400,
        });

        win.detachPin();
        expect(win.isPinned).toBe(false);
        win.togglePin();
        expect(win.isPinned).toBe(true);
        expect(win.pinSide).toBe("top-left");
        expect(win.x).toBe(0);
        expect(win.y).toBe(0);

        // The detach discarded the pre-snap rectangle; the tiled rectangle is
        // now the restore target, matching the existing half-snap semantics.
        win.togglePin();
        expect(win.x).toBe(0);
        expect(win.y).toBe(0);
        expect(win.width).toBe(600);
        expect(win.height).toBe(400);
    });

    it("unpins a corner to the floating rectangle", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("top-left");
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("restores a persisted corner zone", () => {
        const win = makeWindow();
        win.snapToSide("bottom-right");

        const restored = makeWindow();
        expect(restored.isPinned).toBe(true);
        expect(restored.pinSide).toBe("bottom-right");
        expect(restored.x).toBe(600);
        expect(restored.y).toBe(400);
        expect(restored.width).toBe(600);
        expect(restored.height).toBe(400);
    });

    it("honours the minimum height when a half is smaller", () => {
        const win = makeWindow();
        win.minHeight = 500;

        win.snapToSide("top");

        expect(win.height).toBe(500);
        expect(win.y).toBe(0);
    });

    it("accounts for the titlebar and a bottom dock", () => {
        const titlebar = document.createElement("div");
        titlebar.id = "wco-titlebar";
        titlebar.getBoundingClientRect = () =>
            ({ width: 1200, height: 33, left: 0, right: 1200 }) as DOMRect;
        document.body.appendChild(titlebar);

        const dock = document.createElement("div");
        dock.className = "minimized-dock dock-bottom";
        dock.getBoundingClientRect = () =>
            ({ width: 1200, height: 50, left: 0, right: 1200 }) as DOMRect;
        document.body.appendChild(dock);

        const win = makeWindow();
        win.snapToSide("top");

        expect(win.y).toBe(33);
        expect(win.height).toBe(358);
        expect(win.width).toBe(1200);

        titlebar.remove();
        dock.remove();
    });

    it("restores the saved pinned geometry on a new instance", () => {
        const win = makeWindow();
        win.snapToSide("right");
        expect(win.x).toBe(600);

        const restored = makeWindow();
        expect(restored.isPinned).toBe(true);
        expect(restored.pinSide).toBe("right");
        expect(restored.x).toBe(600);
        expect(restored.y).toBe(0);
        expect(restored.width).toBe(600);
        expect(restored.height).toBe(800);
    });

    it("restores the floating target across a reload, so unpin still works", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");

        const restored = makeWindow();
        restored.togglePin();

        expect(restored.isPinned).toBe(false);
        expect(restored.x).toBe(120);
        expect(restored.y).toBe(90);
        expect(restored.width).toBe(600);
        expect(restored.height).toBe(480);
    });

    it("unpins a maximized pinned window back to its floating rectangle", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        win.maximize();

        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.isMaximized).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("records the pre-maximize rectangle when snapping from maximized", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.maximize();

        win.snapToSide("right");
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("returns to the floating geometry when unpinned", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("detaches for a drag without jumping back to the floating geometry", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");
        win.detachPin();

        expect(win.isPinned).toBe(false);
        expect(win.pinSide).toBe("left");
        // The window keeps the tiled rectangle it was dragged from; the
        // pre-snap rectangle is only for the explicit unpin path.
        expect(win.x).toBe(0);
        expect(win.y).toBe(0);
        expect(win.width).toBe(600);
        expect(win.height).toBe(800);
        expect(win.persistedSnapshot).toMatchObject({
            x: 0,
            y: 0,
            width: 600,
            height: 800,
            isPinned: false,
            pinSide: "left",
            pinRestore: null,
        });

        // The detach writes immediately; a reload must not resurrect the pin.
        const reloaded = makeWindow();
        expect(reloaded.isPinned).toBe(false);
        expect(reloaded.x).toBe(0);
        expect(reloaded.width).toBe(600);

        // The last zone survives the reload, so the pin control can return to it.
        reloaded.togglePin();
        expect(reloaded.isPinned).toBe(true);
        expect(reloaded.pinSide).toBe("left");
    });

    it("detaches only once", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");

        win.detachPin();
        win.detachPin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(0);
        expect(win.width).toBe(600);
    });

    it("keeps the original floating target when a pinned window changes sides", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");
        win.snapToSide("right");
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("uses the dragged rectangle as the restore target after a detach and re-snap", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");
        win.detachPin();
        win.x = 300;
        win.y = 100;
        win.snapToSide("right");
        win.togglePin();

        expect(win.x).toBe(300);
        expect(win.y).toBe(100);
        expect(win.width).toBe(600);
        expect(win.height).toBe(800);
    });

    it("clamps the restored rectangle when the viewport shrank", () => {
        const win = makeWindow();
        win.x = 900;
        win.y = 700;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");

        setViewport(500, 400);
        win.togglePin();

        expect(win.x).toBeLessThanOrEqual(500 - win.width * 0.38);
        expect(win.y).toBeLessThanOrEqual(400 - win.height * 0.38);
    });

    it("clamps a malformed small restore rectangle to the window minimums", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 800,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "left",
                pinRestore: { x: 10, y: 10, width: 10, height: 10 },
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        win.togglePin();

        expect(win.width).toBeGreaterThanOrEqual(win.minWidth);
        expect(win.height).toBeGreaterThanOrEqual(win.minHeight);
    });

    it.each([
        ["null", null],
        ["an array", []],
        ["a string", "120,90,600,480"],
        ["a partial object", { x: 0, y: 0, width: 600 }],
        ["zero width", { x: 0, y: 0, width: 0, height: 480 }],
        ["negative height", { x: 0, y: 0, width: 600, height: -1 }],
        ["an absurd size", { x: 0, y: 0, width: 1e9, height: 1e9 }],
        ["a string coordinate", { x: "0", y: 0, width: 600, height: 480 }],
    ])("rejects a malformed pin restore (%s)", (_label, pinRestore) => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 800,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "left",
                pinRestore,
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        expect(() => win.togglePin()).not.toThrow();
        expect(win.isPinned).toBe(false);
        // No valid restore target: the tiled rectangle is the safe fallback.
        expect(win.width).toBe(600);
        expect(win.height).toBe(800);
    });

    it("unpins a restored snapshot whose pin side is missing", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 800,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "none",
                pinRestore: { x: 120, y: 90, width: 600, height: 480 },
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("unpins a legacy pinned snapshot without a restore rectangle", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 800,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "left",
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(0);
        expect(win.width).toBe(600);
        expect(win.height).toBe(800);
    });

    it("unpins a legacy pinned snapshot with no pinSide key at all", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 800,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinRestore: { x: 120, y: 90, width: 600, height: 480 },
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        expect(win.pinSide).toBe("none");
        win.togglePin();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("keeps the pinned float target through a maximize round-trip", () => {
        const win = makeWindow();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;

        win.snapToSide("left");
        win.toggleMaximize();
        expect(win.isPinned).toBe(true);
        expect(win.isMaximized).toBe(true);

        win.toggleMaximize();
        expect(win.isPinned).toBe(true);
        expect(win.isMaximized).toBe(false);
        expect(win.x).toBe(0);
        expect(win.width).toBe(600);

        win.togglePin();
        expect(win.x).toBe(120);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("accounts for visible sidebars", () => {
        const left = document.createElement("div");
        left.dataset.snapSidebar = "left";
        left.getBoundingClientRect = () =>
            ({ width: 200, left: 0, right: 200 }) as unknown as DOMRect;
        document.body.appendChild(left);

        const win = makeWindow();
        win.snapToSide("left");

        expect(win.x).toBe(200);
        expect(win.width).toBe(500);
        left.remove();
    });

    it("loads a legacy vertical pin zone", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 1200,
                height: 400,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "top",
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        expect(win.isPinned).toBe(true);
        expect(win.pinSide).toBe("top");
    });

    it("rejects an unknown persisted pin zone", () => {
        localStorage.setItem(
            "cachy_win_snap-test",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 600,
                height: 400,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "diagonal",
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const win = makeWindow();
        expect(win.pinSide).toBe("none");
        expect(() => win.togglePin()).not.toThrow();
        expect(win.isPinned).toBe(false);
    });
});
