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

import { beforeEach, describe, expect, it } from "vitest";
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
});
