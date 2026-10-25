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
import {
    computeSnapGeometry,
    detectSnapSide,
    isTypingTarget,
    readShellInsets,
    SNAP_EDGE_THRESHOLD_PX,
} from "./snapping";

const originalWidth = window.innerWidth;

function sidebar(side: "left" | "right", left: number, width: number) {
    const element = document.createElement("div");
    element.dataset.snapSidebar = side;
    element.getBoundingClientRect = () =>
        ({
            left,
            right: left + width,
            width,
            height: 800,
            top: 0,
            bottom: 800,
            x: left,
            y: 0,
            toJSON: () => ({}),
        }) as unknown as DOMRect;
    document.body.appendChild(element);
    return element;
}

afterEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "innerWidth", {
        value: originalWidth,
        configurable: true,
    });
});

describe("detectSnapSide", () => {
    it("uses the recorded threshold on both edges", () => {
        expect(SNAP_EDGE_THRESHOLD_PX).toBe(48);
        expect(detectSnapSide(0, 1280)).toBe("left");
        expect(detectSnapSide(48, 1280)).toBe("left");
        expect(detectSnapSide(49, 1280)).toBeNull();
        expect(detectSnapSide(1232, 1280)).toBe("right");
        expect(detectSnapSide(1231, 1280)).toBeNull();
    });

    it("ignores a zero viewport", () => {
        expect(detectSnapSide(0, 0)).toBeNull();
    });
});

describe("computeSnapGeometry", () => {
    it("splits the viewport in half when no sidebar is visible", () => {
        expect(
            computeSnapGeometry("left", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 0, y: 0, width: 640, height: 800 });
        expect(
            computeSnapGeometry("right", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 640, y: 0, width: 640, height: 800 });
    });

    it("insets the usable area by the visible sidebars", () => {
        expect(
            computeSnapGeometry("left", 1280, 800, { left: 300, right: 200 }),
        ).toEqual({ x: 300, y: 0, width: 390, height: 800 });
        expect(
            computeSnapGeometry("right", 1280, 800, { left: 300, right: 200 }),
        ).toEqual({ x: 690, y: 0, width: 390, height: 800 });
    });

    it("honours the window minimum width", () => {
        expect(
            computeSnapGeometry("right", 1280, 800, { left: 0, right: 0 }, 700),
        ).toEqual({ x: 580, y: 0, width: 700, height: 800 });
    });
});

describe("readShellInsets", () => {
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", {
            value: 1280,
            configurable: true,
        });
    });

    it("measures visible sidebars and ignores hidden ones", () => {
        sidebar("left", 0, 300);
        sidebar("right", 1080, 200);
        expect(readShellInsets()).toEqual({ left: 300, right: 200 });
    });

    it("returns zero for missing or zero-width sidebars", () => {
        sidebar("left", 0, 0);
        expect(readShellInsets()).toEqual({ left: 0, right: 0 });
    });
});

describe("isTypingTarget", () => {
    it("detects editable controls but not a plain div", () => {
        const input = document.createElement("input");
        const textarea = document.createElement("textarea");
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        const plain = document.createElement("div");

        expect(isTypingTarget(input)).toBe(true);
        expect(isTypingTarget(textarea)).toBe(true);
        expect(isTypingTarget(editable)).toBe(true);
        expect(isTypingTarget(plain)).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
    });
});
