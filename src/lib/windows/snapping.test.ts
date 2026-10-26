// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
    detectSnapZone,
    isSnapZone,
    isTypingTarget,
    nextSnapZone,
    readShellInsets,
    SNAP_EDGE_THRESHOLD_PX,
} from "./snapping";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function rect(left: number, top: number, width: number, height: number) {
    return {
        left,
        right: left + width,
        width,
        height,
        top,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
    } as unknown as DOMRect;
}

function sidebar(side: "left" | "right", left: number, width: number) {
    const element = document.createElement("div");
    element.dataset.snapSidebar = side;
    element.getBoundingClientRect = () => rect(left, 0, width, 800);
    document.body.appendChild(element);
    return element;
}

function titlebar(height: number) {
    const element = document.createElement("div");
    element.id = "wco-titlebar";
    element.getBoundingClientRect = () => rect(0, 0, 1280, height);
    document.body.appendChild(element);
    return element;
}

function dock(side: "top" | "bottom", height: number) {
    const element = document.createElement("div");
    element.className = `minimized-dock dock-${side}`;
    element.getBoundingClientRect = () => rect(0, 0, 1280, height);
    document.body.appendChild(element);
    return element;
}

afterEach(() => {
    document.body.innerHTML = "";
    Object.defineProperty(window, "innerWidth", {
        value: originalWidth,
        configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
        value: originalHeight,
        configurable: true,
    });
});

describe("detectSnapZone", () => {
    it("uses the recorded threshold on all four edges", () => {
        expect(SNAP_EDGE_THRESHOLD_PX).toBe(48);
        expect(detectSnapZone(0, 400, 1280, 800)).toBe("left");
        expect(detectSnapZone(48, 400, 1280, 800)).toBe("left");
        expect(detectSnapZone(49, 400, 1280, 800)).toBeNull();
        expect(detectSnapZone(1232, 400, 1280, 800)).toBe("right");
        expect(detectSnapZone(1231, 400, 1280, 800)).toBeNull();
        expect(detectSnapZone(640, 0, 1280, 800)).toBe("top");
        expect(detectSnapZone(640, 48, 1280, 800)).toBe("top");
        expect(detectSnapZone(640, 49, 1280, 800)).toBeNull();
        expect(detectSnapZone(640, 800, 1280, 800)).toBe("bottom");
        expect(detectSnapZone(640, 752, 1280, 800)).toBe("bottom");
        expect(detectSnapZone(640, 751, 1280, 800)).toBeNull();
    });

    it("prefers a corner when both axes are in range", () => {
        expect(detectSnapZone(0, 0, 1280, 800)).toBe("top-left");
        expect(detectSnapZone(1280, 0, 1280, 800)).toBe("top-right");
        expect(detectSnapZone(0, 800, 1280, 800)).toBe("bottom-left");
        expect(detectSnapZone(1280, 800, 1280, 800)).toBe(
            "bottom-right",
        );
        expect(detectSnapZone(48, 48, 1280, 800)).toBe("top-left");
        expect(detectSnapZone(49, 49, 1280, 800)).toBeNull();
    });

    it("ignores a zero or non-finite viewport", () => {
        expect(detectSnapZone(0, 0, 0, 800)).toBeNull();
        expect(detectSnapZone(0, 0, 1280, 0)).toBeNull();
        expect(detectSnapZone(Number.NaN, 0, 1280, 800)).toBeNull();
    });

    it("pins the small-viewport tie: the left edge wins at the midpoint", () => {
        expect(detectSnapZone(48, 400, 96, 800)).toBe("left");
        expect(detectSnapZone(49, 400, 96, 800)).toBe("right");
    });
});

describe("nextSnapZone", () => {
    it("sets a half from no snap", () => {
        expect(nextSnapZone("none", "left")).toBe("left");
        expect(nextSnapZone("none", "right")).toBe("right");
        expect(nextSnapZone("none", "up")).toBe("top");
        expect(nextSnapZone("none", "down")).toBe("bottom");
    });

    it("refines a half into a corner on the perpendicular axis", () => {
        expect(nextSnapZone("left", "up")).toBe("top-left");
        expect(nextSnapZone("left", "down")).toBe("bottom-left");
        expect(nextSnapZone("right", "up")).toBe("top-right");
        expect(nextSnapZone("right", "down")).toBe("bottom-right");
        expect(nextSnapZone("top", "left")).toBe("top-left");
        expect(nextSnapZone("top", "right")).toBe("top-right");
        expect(nextSnapZone("bottom", "left")).toBe("bottom-left");
        expect(nextSnapZone("bottom", "right")).toBe("bottom-right");
    });

    it("collapses a corner back to the half on the pressed axis", () => {
        expect(nextSnapZone("top-left", "left")).toBe("left");
        expect(nextSnapZone("top-left", "right")).toBe("right");
        expect(nextSnapZone("top-left", "up")).toBe("top");
        expect(nextSnapZone("top-left", "down")).toBe("bottom");
        expect(nextSnapZone("bottom-right", "up")).toBe("top");
        expect(nextSnapZone("bottom-right", "down")).toBe("bottom");
    });

    it("switches the half on the same axis", () => {
        expect(nextSnapZone("left", "right")).toBe("right");
        expect(nextSnapZone("right", "left")).toBe("left");
        expect(nextSnapZone("top", "down")).toBe("bottom");
        expect(nextSnapZone("bottom", "up")).toBe("top");
    });

    it("covers every current state and direction", () => {
        const cases = [
            ["none", "left", "left"],
            ["none", "right", "right"],
            ["none", "up", "top"],
            ["none", "down", "bottom"],
            ["left", "left", "left"],
            ["left", "right", "right"],
            ["left", "up", "top-left"],
            ["left", "down", "bottom-left"],
            ["right", "left", "left"],
            ["right", "right", "right"],
            ["right", "up", "top-right"],
            ["right", "down", "bottom-right"],
            ["top", "left", "top-left"],
            ["top", "right", "top-right"],
            ["top", "up", "top"],
            ["top", "down", "bottom"],
            ["bottom", "left", "bottom-left"],
            ["bottom", "right", "bottom-right"],
            ["bottom", "up", "top"],
            ["bottom", "down", "bottom"],
            ["top-left", "left", "left"],
            ["top-left", "right", "right"],
            ["top-left", "up", "top"],
            ["top-left", "down", "bottom"],
            ["top-right", "left", "left"],
            ["top-right", "right", "right"],
            ["top-right", "up", "top"],
            ["top-right", "down", "bottom"],
            ["bottom-left", "left", "left"],
            ["bottom-left", "right", "right"],
            ["bottom-left", "up", "top"],
            ["bottom-left", "down", "bottom"],
            ["bottom-right", "left", "left"],
            ["bottom-right", "right", "right"],
            ["bottom-right", "up", "top"],
            ["bottom-right", "down", "bottom"],
        ] as const;

        for (const [current, direction, expected] of cases) {
            expect(nextSnapZone(current, direction)).toBe(expected);
        }
    });
});

describe("isSnapZone", () => {
    it("accepts the eight zones and rejects anything else", () => {
        for (const zone of [
            "left",
            "right",
            "top",
            "bottom",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
        ]) {
            expect(isSnapZone(zone)).toBe(true);
        }
        expect(isSnapZone("none")).toBe(false);
        expect(isSnapZone("diagonal")).toBe(false);
        expect(isSnapZone(null)).toBe(false);
        expect(isSnapZone(1)).toBe(false);
    });
});

describe("computeSnapGeometry", () => {
    it("splits the viewport into the four halves", () => {
        expect(
            computeSnapGeometry("left", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 0, y: 0, width: 640, height: 800 });
        expect(
            computeSnapGeometry("right", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 640, y: 0, width: 640, height: 800 });
        expect(
            computeSnapGeometry("top", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 0, y: 0, width: 1280, height: 400 });
        expect(
            computeSnapGeometry("bottom", 1280, 800, { left: 0, right: 0 }),
        ).toEqual({ x: 0, y: 400, width: 1280, height: 400 });
    });

    it("splits the viewport into the four corners", () => {
        expect(
            computeSnapGeometry("top-left", 1280, 800, {
                left: 0,
                right: 0,
            }),
        ).toEqual({ x: 0, y: 0, width: 640, height: 400 });
        expect(
            computeSnapGeometry("top-right", 1280, 800, {
                left: 0,
                right: 0,
            }),
        ).toEqual({ x: 640, y: 0, width: 640, height: 400 });
        expect(
            computeSnapGeometry("bottom-left", 1280, 800, {
                left: 0,
                right: 0,
            }),
        ).toEqual({ x: 0, y: 400, width: 640, height: 400 });
        expect(
            computeSnapGeometry("bottom-right", 1280, 800, {
                left: 0,
                right: 0,
            }),
        ).toEqual({ x: 640, y: 400, width: 640, height: 400 });
    });

    it("insets the usable area by sidebars, titlebar and dock", () => {
        const insets = { left: 300, right: 200, top: 40, bottom: 60 };

        expect(
            computeSnapGeometry("left", 1280, 800, insets),
        ).toEqual({ x: 300, y: 40, width: 390, height: 700 });
        expect(
            computeSnapGeometry("right", 1280, 800, insets),
        ).toEqual({ x: 690, y: 40, width: 390, height: 700 });
        expect(
            computeSnapGeometry("top", 1280, 800, insets),
        ).toEqual({ x: 300, y: 40, width: 780, height: 350 });
        expect(
            computeSnapGeometry("bottom", 1280, 800, insets),
        ).toEqual({ x: 300, y: 390, width: 780, height: 350 });
        expect(
            computeSnapGeometry("top-left", 1280, 800, insets),
        ).toEqual({ x: 300, y: 40, width: 390, height: 350 });
        expect(
            computeSnapGeometry("bottom-right", 1280, 800, insets),
        ).toEqual({ x: 690, y: 390, width: 390, height: 350 });
        expect(
            computeSnapGeometry("top-right", 1280, 800, insets),
        ).toEqual({ x: 690, y: 40, width: 390, height: 350 });
        expect(
            computeSnapGeometry("bottom-left", 1280, 800, insets),
        ).toEqual({ x: 300, y: 390, width: 390, height: 350 });
    });

    it("applies both minimums to every zone", () => {
        const zones = [
            "left",
            "right",
            "top",
            "bottom",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
        ] as const;

        for (const zone of zones) {
            const geometry = computeSnapGeometry(
                zone,
                300,
                200,
                { left: 0, right: 0 },
                700,
                500,
            );
            expect(geometry.width).toBeGreaterThanOrEqual(700);
            expect(geometry.height).toBeGreaterThanOrEqual(500);
            expect(geometry.x).toBeGreaterThanOrEqual(0);
            expect(geometry.y).toBeGreaterThanOrEqual(0);
        }

        // A floored half keeps its top/left anchor instead of moving the
        // header off-screen; the chrome paints above the overlap.
        expect(
            computeSnapGeometry("right", 300, 200, { left: 0, right: 0 }, 700),
        ).toMatchObject({ x: 0 });
        expect(
            computeSnapGeometry("bottom", 300, 200, { left: 0, right: 0 }, 0, 500),
        ).toMatchObject({ y: 0 });
    });

    it("splits odd dimensions without a gap or overlap", () => {
        const left = computeSnapGeometry("left", 1281, 801, {
            left: 0,
            right: 0,
        });
        const right = computeSnapGeometry("right", 1281, 801, {
            left: 0,
            right: 0,
        });
        const top = computeSnapGeometry("top", 1281, 801, {
            left: 0,
            right: 0,
        });
        const bottom = computeSnapGeometry("bottom", 1281, 801, {
            left: 0,
            right: 0,
        });

        expect(left.x + left.width).toBe(right.x);
        expect(left.width + right.width).toBe(1281);
        expect(top.y + top.height).toBe(bottom.y);
        expect(top.height + bottom.height).toBe(801);
    });

    it("honours the window minimum width and height", () => {
        expect(
            computeSnapGeometry(
                "top-right",
                1280,
                800,
                { left: 0, right: 0 },
                700,
                500,
            ),
        ).toEqual({ x: 580, y: 0, width: 700, height: 500 });
    });
});

describe("readShellInsets", () => {
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", {
            value: 1280,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 800,
            configurable: true,
        });
    });

    it("measures visible sidebars and ignores hidden ones", () => {
        sidebar("left", 0, 300);
        sidebar("right", 1080, 200);
        expect(readShellInsets()).toEqual({
            left: 300,
            right: 200,
            top: 0,
            bottom: 0,
        });
    });

    it("returns zero for missing or zero-width sidebars", () => {
        sidebar("left", 0, 0);
        expect(readShellInsets()).toEqual({
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        });
    });

    it("measures the union of the PWA titlebar and a top dock", () => {
        titlebar(33);
        dock("top", 40);
        expect(readShellInsets()).toEqual({
            left: 0,
            right: 0,
            top: 40,
            bottom: 0,
        });
    });

    it("measures a bottom dock separately", () => {
        titlebar(33);
        dock("bottom", 50);
        expect(readShellInsets()).toEqual({
            left: 0,
            right: 0,
            top: 33,
            bottom: 50,
        });
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
