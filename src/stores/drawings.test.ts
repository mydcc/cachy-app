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
 * FEAT-0480 criteria: drawings survive a reload, keep stable ids across a
 * reload and a symbol switch, and belong to exactly one symbol.
 *
 * "Survives a reload" is tested by writing through one store instance and
 * reading with a fresh one over the same `localStorage` — which is what a
 * reload actually is, minus the browser.
 */

import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `safeLocalStorage` returns early on every method when `browser` is false,
// which it is in the `unit` project — without this the store would be writing
// into a no-op and every persistence assertion would pass or fail for the
// wrong reason.
vi.mock("$app/environment", () => ({ browser: true, dev: false }));

import { DRAWINGS_STORAGE_KEY } from "../lib/chart/drawings/types";
import { levelAt } from "../lib/chart/drawings/levelAt";
import { drawingStore } from "./drawings.svelte";

const T0 = 1_757_030_400_000;
const HOUR = 3_600_000;

/** What a reload does: same bytes on disk, a store that has not read them yet. */
function reload() {
    const raw = localStorage.getItem(DRAWINGS_STORAGE_KEY);
    drawingStore.reset();
    if (raw) localStorage.setItem(DRAWINGS_STORAGE_KEY, raw);
    drawingStore.load();
}

beforeEach(() => {
    drawingStore.reset();
    drawingStore.load();
});

describe("keeping drawings", () => {
    it("survives a reload with the same id", () => {
        const drawn = drawingStore.addHorizontal("BTCUSDT", "50000");

        reload();

        const [restored] = drawingStore.forSymbol("BTCUSDT");
        expect(restored.id).toBe(drawn.id);
        expect(restored).toMatchObject({ kind: "horizontal", price: "50000" });
    });

    it("keeps a trend line's anchors through a reload", () => {
        const drawn = drawingStore.addTrend(
            "BTCUSDT",
            { ms: T0, price: "50000" },
            { ms: T0 + 10 * HOUR, price: "51000" },
        );

        reload();

        const restored = drawingStore.byId(drawn!.id);
        expect(levelAt(restored!, T0 + 5 * HOUR)?.toString()).toBe("50500");
    });

    it("gives every drawing its own id", () => {
        const a = drawingStore.addHorizontal("BTCUSDT", "50000");
        const b = drawingStore.addHorizontal("BTCUSDT", "50000");

        expect(a.id).not.toBe(b.id);
    });

    it("stores a price as an exact decimal string, whatever it was given", () => {
        // The chart hands over a float from `coordinateToPrice`; what lands on
        // disk must still be the number the trader can read back.
        drawingStore.addHorizontal("BTCUSDT", new Decimal("0.000001"));
        drawingStore.addHorizontal("ETHUSDT", 2500.5);

        expect(drawingStore.forSymbol("BTCUSDT")[0]).toMatchObject({ price: "0.000001" });
        expect(drawingStore.forSymbol("ETHUSDT")[0]).toMatchObject({ price: "2500.5" });
    });
});

describe("one drawing, one symbol", () => {
    it("shows a symbol only its own drawings", () => {
        drawingStore.addHorizontal("BTCUSDT", "50000");
        drawingStore.addHorizontal("ETHUSDT", "2500");

        expect(drawingStore.forSymbol("BTCUSDT")).toHaveLength(1);
        expect(drawingStore.forSymbol("ETHUSDT")).toHaveLength(1);
        expect(drawingStore.forSymbol("SOLUSDT")).toHaveLength(0);
    });

    it("keeps ids stable across a symbol switch", () => {
        // Switching the chart's symbol re-filters the same store; it must not
        // re-create anything, or every alert anchored to a drawing would come
        // loose the first time the trader looked at another market.
        const btc = drawingStore.addHorizontal("BTCUSDT", "50000");
        drawingStore.forSymbol("ETHUSDT");

        expect(drawingStore.forSymbol("BTCUSDT")[0].id).toBe(btc.id);
    });
});

describe("changing a drawing", () => {
    it("moves a horizontal line and keeps the move", () => {
        const drawn = drawingStore.addHorizontal("BTCUSDT", "50000");

        drawingStore.moveHorizontal(drawn.id, "49000");
        reload();

        expect(drawingStore.byId(drawn.id)).toMatchObject({ price: "49000" });
    });

    it("moves one end of a trend line", () => {
        const drawn = drawingStore.addTrend(
            "BTCUSDT",
            { ms: T0, price: "50000" },
            { ms: T0 + 10 * HOUR, price: "51000" },
        )!;

        drawingStore.moveTrend(drawn.id, { to: { ms: T0 + 10 * HOUR, price: "52000" } });

        expect(levelAt(drawingStore.byId(drawn.id)!, T0 + 5 * HOUR)?.toString()).toBe("51000");
    });

    it("deletes a drawing and the deletion survives a reload", () => {
        const drawn = drawingStore.addHorizontal("BTCUSDT", "50000");

        drawingStore.remove(drawn.id);
        reload();

        expect(drawingStore.byId(drawn.id)).toBeNull();
    });

    it("clears the selection when the selected drawing is deleted", () => {
        const drawn = drawingStore.addHorizontal("BTCUSDT", "50000");
        drawingStore.select(drawn.id);

        drawingStore.remove(drawn.id);

        expect(drawingStore.selectedId).toBeNull();
    });

    it("ignores a move or delete for an id it does not know", () => {
        drawingStore.addHorizontal("BTCUSDT", "50000");

        drawingStore.moveHorizontal("nope", "1");
        drawingStore.remove("nope");

        expect(drawingStore.drawings).toHaveLength(1);
    });
});

describe("refusing what cannot be read back", () => {
    it("refuses a vertical trend line", () => {
        // `levelAt` has no answer for one, so it would render as a line the
        // trader can see but no alert can ever use.
        expect(
            drawingStore.addTrend("BTCUSDT", { ms: T0, price: "50000" }, { ms: T0, price: "51000" }),
        ).toBeNull();
        expect(drawingStore.drawings).toHaveLength(0);
    });

    it("refuses a drag that would make a trend line vertical", () => {
        const drawn = drawingStore.addTrend(
            "BTCUSDT",
            { ms: T0, price: "50000" },
            { ms: T0 + HOUR, price: "51000" },
        )!;

        drawingStore.moveTrend(drawn.id, { from: { ms: T0 + HOUR, price: "50000" } });

        expect(drawingStore.byId(drawn.id)).toMatchObject({ fromMs: T0 });
    });

    it("stores trend anchors left to right however they were drawn", () => {
        // Dragging right-to-left is normal; every later reader gets to assume
        // fromMs < toMs instead of re-deriving it.
        const drawn = drawingStore.addTrend(
            "BTCUSDT",
            { ms: T0 + 10 * HOUR, price: "51000" },
            { ms: T0, price: "50000" },
        )!;

        expect(drawn.fromMs).toBe(T0);
        expect(drawn.fromPrice).toBe("50000");
        expect(drawn.toMs).toBe(T0 + 10 * HOUR);
    });
});

describe("reading a file it did not write", () => {
    it("drops a malformed drawing and keeps the good ones", () => {
        drawingStore.reset();
        localStorage.setItem(
            DRAWINGS_STORAGE_KEY,
            JSON.stringify({
                schema_version: 1,
                drawings: [
                    { kind: "horizontal", id: "ok", symbol: "BTCUSDT", createdAtMs: 0, price: "1" },
                    { kind: "horizontal", id: "bad-price", symbol: "BTCUSDT", createdAtMs: 0, price: "abc" },
                    { kind: "trend", id: "no-anchors", symbol: "BTCUSDT", createdAtMs: 0 },
                    { kind: "circle", id: "unknown-kind", symbol: "BTCUSDT", createdAtMs: 0 },
                    null,
                ],
            }),
        );
        drawingStore.load();

        expect(drawingStore.drawings.map((d) => d.id)).toEqual(["ok"]);
    });

    it("survives bytes that are not JSON at all", () => {
        drawingStore.reset();
        localStorage.setItem(DRAWINGS_STORAGE_KEY, "{not json");

        expect(() => drawingStore.load()).not.toThrow();
        expect(drawingStore.drawings).toEqual([]);
        // The unreadable bytes stay: they are the only copy, and a human may
        // still want to look at them.
        expect(localStorage.getItem(DRAWINGS_STORAGE_KEY)).toBe("{not json");
    });
});
