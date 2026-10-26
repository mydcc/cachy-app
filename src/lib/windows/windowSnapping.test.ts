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

import { describe, expect, it } from "vitest";
import {
    snapToWindows,
    WINDOW_SNAP_THRESHOLD_PX,
} from "./windowSnapping";

const NO_INSETS = { left: 0, right: 0 };
const OTHER = { x: 100, y: 100, width: 400, height: 300 };

function snap(
    rawX: number,
    rawY: number,
    others = [OTHER],
    width = 300,
    height = 200,
    insets = NO_INSETS,
    viewportWidth = 1000,
    viewportHeight = 800,
) {
    return snapToWindows(
        rawX,
        rawY,
        width,
        height,
        others,
        viewportWidth,
        viewportHeight,
        insets,
    );
}

describe("snapToWindows", () => {
    it("uses a 12 px magnet", () => {
        expect(WINDOW_SNAP_THRESHOLD_PX).toBe(12);
    });

    it("aligns the left edges of two windows", () => {
        expect(snap(103, 300).x).toBe(100);
    });

    it("aligns the right edges of two windows", () => {
        expect(snap(305, 300, [OTHER], 200).x).toBe(300);
    });

    it("places a window flush to the right of another", () => {
        const other = { x: 400, y: 100, width: 300, height: 300 };
        expect(snap(703, 300, [other], 200).x).toBe(700);
    });

    it("places a window flush to the left of another", () => {
        const other = { x: 100, y: 100, width: 300, height: 300 };
        expect(snap(-97, 300, [other], 200).x).toBe(-100);
    });

    it("aligns centres", () => {
        const other = { x: 100, y: 100, width: 500, height: 300 };
        // other centre 350, moving width 300 -> x 200.
        expect(snap(205, 300, [other]).x).toBe(200);
    });

    it("aligns the top edge and places flush below", () => {
        expect(snap(300, 103).y).toBe(100);
        expect(snap(300, 403, [OTHER], 300, 200).y).toBe(400);
    });

    it("aligns bottom/bottom, y-centre and the space above a window", () => {
        const bottom = { x: 100, y: 100, width: 300, height: 300 };
        expect(snap(300, 203, [bottom]).y).toBe(200);

        const tall = { x: 100, y: 100, width: 300, height: 500 };
        expect(snap(300, 255, [tall]).y).toBe(250);

        const lower = { x: 100, y: 300, width: 400, height: 200 };
        expect(snap(300, 103, [lower]).y).toBe(100);
    });

    it("snaps both axes in one move", () => {
        const other = { x: 200, y: 150, width: 300, height: 200 };
        expect(snap(203, 153, [other])).toEqual({ x: 200, y: 150 });
    });

    it("chooses the nearest candidate when two windows are close", () => {
        const first = { x: 115, y: 100, width: 300, height: 300 };
        const second = { x: 120, y: 100, width: 300, height: 300 };
        expect(snap(115, 300, [first, second]).x).toBe(115);
    });

    it("snaps to the usable screen centre", () => {
        expect(snap(305, 300, [], 400)).toEqual({ x: 300, y: 300 });

        const insets = { left: 100, right: 300, top: 40, bottom: 60 };
        // Usable x 100..700, width 400 -> x centre 200.
        // Usable y 40..740, height 200 -> y centre 290.
        expect(snap(205, 295, [], 400, 200, insets)).toEqual({
            x: 200,
            y: 290,
        });
    });

    it("gives the screen centre an exact tie over a window edge", () => {
        const other = { x: 312, y: 300, width: 300, height: 200 };
        expect(snap(306, 300, [other], 400).x).toBe(300);
    });

    it("rounds a snapped half-pixel candidate", () => {
        expect(snap(355, 300, [], 300, 200, NO_INSETS, 1001, 800).x).toBe(
            351,
        );
    });

    it("snaps at exactly 12 px and not at 13 px", () => {
        expect(snap(312, 300, [], 400).x).toBe(300);
        expect(snap(313, 300, [], 400).x).toBe(313);
    });

    it("returns the rounded raw position when nothing is close", () => {
        expect(snap(637.4, 419.6, [])).toEqual({ x: 637, y: 420 });
    });

    it("ignores invalid targets instead of snapping to them", () => {
        const invalid = { x: 100, y: 100, width: 0, height: 0 };
        expect(snap(103, 103, [invalid])).toEqual({ x: 103, y: 103 });
    });

    it("keeps the raw position for invalid dragged geometry", () => {
        expect(snap(503, 500, [], 0)).toEqual({ x: 503, y: 500 });
        expect(snap(Number.NaN, 500, [])).toEqual({ x: 0, y: 500 });
    });

    it("does not clamp a centre that is wider than the viewport", () => {
        // The helper returns the mathematical centre; WindowBase.updatePosition
        // owns the visible-position clamp.
        expect(snap(-97, 300, [], 400, 200, NO_INSETS, 200, 800).x).toBe(-100);
    });
});
