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

import { describe, it, expect } from "vitest";
import {
    formatBadgeValue,
    badgeRect,
    nearestEntry,
    type BadgePoint,
} from "./crosshairValueBadge";
import type { Time } from "lightweight-charts";

function points(values: Array<[number, number]>): BadgePoint[] {
    return values.map(([t, v]) => ({ time: t as Time, value: v }));
}

describe("formatBadgeValue", () => {
    it("matches formatProfit's tier boundaries", () => {
        expect(formatBadgeValue(34.756)).toBe("34.76");
        expect(formatBadgeValue(0.0001234)).toBe("0.0001");
        expect(formatBadgeValue(1234.5)).toBe("1235");
        expect(formatBadgeValue(0)).toBe("0.00");
        expect(formatBadgeValue(-12.345)).toBe("-12.35");
        expect(formatBadgeValue(0.1)).toBe("0.10");
        expect(formatBadgeValue(1000)).toBe("1000");
    });

    it("renders nothing for non-finite values", () => {
        expect(formatBadgeValue(Number.NaN)).toBe("");
        expect(formatBadgeValue(Number.POSITIVE_INFINITY)).toBe("");
    });
});

describe("badgeRect", () => {
    it("centres the pill above the dot", () => {
        const rect = badgeRect(100, 100, 40, 400, 300);
        expect(rect.x).toBeCloseTo(100 - rect.w / 2, 5);
        expect(rect.y + rect.h).toBeLessThanOrEqual(100 - 8);
        expect(rect.below).toBe(false);
    });

    it("clamps into the pane at the left and right edges", () => {
        const left = badgeRect(2, 100, 40, 400, 300);
        expect(left.x).toBe(0);
        const right = badgeRect(399, 100, 40, 400, 300);
        expect(right.x + right.w).toBeLessThanOrEqual(400);
    });

    it("drops below the dot when there is no room above", () => {
        const rect = badgeRect(100, 5, 40, 400, 300);
        expect(rect.below).toBe(true);
        expect(rect.y).toBeGreaterThanOrEqual(5 + 8);
    });

    it("clamps below the pane bottom when the dot sits at the edge", () => {
        const rect = badgeRect(100, 298, 40, 400, 300);
        expect(rect.below).toBe(true);
        expect(rect.y + rect.h).toBeLessThanOrEqual(300);
    });
});

describe("nearestEntry", () => {
    it("returns null without entries", () => {
        expect(nearestEntry([], 10 as Time)).toBeNull();
    });

    it("snaps the hovered time to the closest bar", () => {
        const entries = points([
            [10, 1.5],
            [20, 2.5],
            [30, 3.5],
        ]);
        expect(nearestEntry(entries, 10 as Time)).toEqual({ time: 10, value: 1.5 });
        expect(nearestEntry(entries, 19 as Time)).toEqual({ time: 20, value: 2.5 });
        expect(nearestEntry(entries, 100 as Time)).toEqual({ time: 30, value: 3.5 });
    });

    it("returns null for a non-numeric time instead of a wrong entry", () => {
        const entries = points([[10, 1.5]]);
        expect(nearestEntry(entries, Number.NaN as unknown as Time)).toBeNull();
    });
});
