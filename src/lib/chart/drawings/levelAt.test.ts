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

/**
 * FEAT-0480 criterion: "the level of a sloped line is readable at an arbitrary
 * timestamp". This is the arithmetic that answers it, and it is worth
 * exhausting — the renderer and FEAT-0029's alerts both read it, so an error
 * here is both a wrong picture and a wrong trigger.
 */

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { candleTouches, levelAt } from "./levelAt";
import type { HorizontalDrawing, TrendDrawing } from "./types";

const HOUR = 3_600_000;
const T0 = 1_757_030_400_000;

const horizontal: HorizontalDrawing = {
    kind: "horizontal",
    id: "h1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    price: "50000",
};

/** Rises 1 000 over 10 hours: 100 per hour, an exact decimal slope. */
const trend: TrendDrawing = {
    kind: "trend",
    id: "t1",
    symbol: "BTCUSDT",
    createdAtMs: T0,
    fromMs: T0,
    fromPrice: "50000",
    toMs: T0 + 10 * HOUR,
    toPrice: "51000",
};

describe("the level a drawing sits at", () => {
    it("gives a horizontal line the same price at every timestamp", () => {
        expect(levelAt(horizontal, T0)?.toString()).toBe("50000");
        expect(levelAt(horizontal, T0 + 999 * HOUR)?.toString()).toBe("50000");
        expect(levelAt(horizontal, 0)?.toString()).toBe("50000");
    });

    it("returns each anchor's own price at that anchor", () => {
        expect(levelAt(trend, T0)?.toString()).toBe("50000");
        expect(levelAt(trend, T0 + 10 * HOUR)?.toString()).toBe("51000");
    });

    it("interpolates between the anchors", () => {
        expect(levelAt(trend, T0 + 5 * HOUR)?.toString()).toBe("50500");
        expect(levelAt(trend, T0 + HOUR)?.toString()).toBe("50100");
    });

    it("extrapolates past the second anchor, which is the point of a trend line", () => {
        // A trader anchors on two swings to find out where the line will be
        // next week. Clipping here would make every forward-looking alert
        // unarmable.
        expect(levelAt(trend, T0 + 20 * HOUR)?.toString()).toBe("52000");
        expect(levelAt(trend, T0 + 100 * HOUR)?.toString()).toBe("60000");
    });

    it("extrapolates backwards too", () => {
        expect(levelAt(trend, T0 - 10 * HOUR)?.toString()).toBe("49000");
    });

    it("follows a falling line down", () => {
        const falling: TrendDrawing = { ...trend, fromPrice: "51000", toPrice: "50000" };
        expect(levelAt(falling, T0 + 5 * HOUR)?.toString()).toBe("50500");
        expect(levelAt(falling, T0 + 20 * HOUR)?.toString()).toBe("49000");
    });

    it("says nothing rather than zero for a vertical line", () => {
        // Not a function of time: there is no single price to cross. `null`
        // has to mean "do not fire" at every call site, which is why it is
        // not 0 — 0 would arm an alert on an unreachable threshold.
        const vertical: TrendDrawing = { ...trend, toMs: T0 };
        expect(levelAt(vertical, T0)).toBeNull();
        expect(levelAt(vertical, T0 + HOUR)).toBeNull();
    });

    it("keeps decimal precision instead of drifting through float math", () => {
        // 0.1 + 0.2 territory: a slope this small is where a `number`
        // implementation starts producing levels the trader never drew.
        const tiny: TrendDrawing = {
            ...trend,
            fromPrice: "0.1",
            toMs: T0 + 3,
            toPrice: "0.4",
        };
        expect(levelAt(tiny, T0 + 1)?.toString()).toBe("0.2");
        expect(levelAt(tiny, T0 + 2)?.toString()).toBe("0.3");
    });

    it("returns a Decimal, so callers never re-parse a float", () => {
        expect(levelAt(horizontal, T0)).toBeInstanceOf(Decimal);
    });
});

describe("whether a candle met the drawing", () => {
    const candle = (low: string, high: string) => ({ open_time_ms: T0, low, high });

    it("counts a candle whose range spans the level", () => {
        expect(candleTouches(horizontal, candle("49500", "50500"))).toBe(true);
    });

    it("counts a wick that reaches the level exactly", () => {
        // Touch counts, matching the core's crossing semantics (BUG-0464).
        expect(candleTouches(horizontal, candle("50000", "50500"))).toBe(true);
        expect(candleTouches(horizontal, candle("49500", "50000"))).toBe(true);
    });

    it("rejects a candle that stayed clear of the level", () => {
        expect(candleTouches(horizontal, candle("50001", "50500"))).toBe(false);
        expect(candleTouches(horizontal, candle("49000", "49999"))).toBe(false);
    });

    it("uses the sloped level at that candle's own timestamp", () => {
        // 50 500 at T0+5h — a candle that would have missed the anchor price
        // meets the line here, and one sitting at the anchor no longer does.
        const at5h = { open_time_ms: T0 + 5 * HOUR, low: "50400", high: "50600" };
        expect(candleTouches(trend, at5h)).toBe(true);
        expect(candleTouches(trend, { ...at5h, low: "49900", high: "50100" })).toBe(false);
    });

    it("never fires on a vertical line", () => {
        const vertical: TrendDrawing = { ...trend, toMs: T0 };
        expect(candleTouches(vertical, candle("0", "999999"))).toBe(false);
    });
});
