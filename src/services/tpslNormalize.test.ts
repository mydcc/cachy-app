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

/*
 * BUG-0292 — normalising Bitunix TP/SL rows.
 *
 * The fixture below is copied verbatim from the response example in
 * `docs/bitunix-api/06_tp_sl.md` §Get Pending TP/SL Order, and that is the
 * point of this file. The bug it covers survived because `tpsl.test.ts` builds
 * its plans by hand as `{orderId, symbol, planType, triggerPrice, status}` — a
 * shape the venue never sends — so the store's logic was proven correct on
 * input it does not receive. A test written against the documented response
 * would have failed on day one.
 */

import { describe, it, expect } from "vitest";
import { normalizeTpSlRow, normalizeTpSlRows } from "./tpslNormalize";

/** Verbatim from `06_tp_sl.md` §Get Pending TP/SL Order → Response Example. */
const DOCUMENTED_ROW = {
    id: "123",
    positionId: "12345678",
    symbol: "BTCUSDT",
    base: "BTC",
    quote: "USDT",
    tpPrice: "50000",
    tpStopType: "LAST_PRICE",
    slPrice: "70000",
    slStopType: "LAST_PRICE",
    tpOrderType: "LIMIT",
    tpOrderPrice: "50000",
    slOrderType: "LIMIT",
    slOrderPrice: "70000",
    tpQty: "0.01",
    slQty: "0.01",
};

describe("the documented response row", () => {
    it("becomes two plans, one per leg", () => {
        // The behaviour the old code got wrong: it produced one object that
        // grouped as neither, so `plansFor()` returned nothing.
        expect(normalizeTpSlRow(DOCUMENTED_ROW)).toHaveLength(2);
    });

    it("types each leg so plansFor can group it", () => {
        const [tp, sl] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.planType).toBe("PROFIT");
        expect(sl.planType).toBe("LOSS");
    });

    it("gives each leg its own trigger price, from its own field", () => {
        const [tp, sl] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.triggerPrice).toBe("50000");
        expect(sl.triggerPrice).toBe("70000");
    });

    it("names the legs the way the WebSocket split does", () => {
        // `updateFromWs` builds `${orderId}-tp` / `${orderId}-sl`. If these
        // disagreed, a live push would append beside the fetched row instead
        // of replacing it, and the list would show the same plan twice.
        const [tp, sl] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.orderId).toBe("123-tp");
        expect(sl.orderId).toBe("123-sl");
    });

    it("carries each leg's own quantity", () => {
        const [tp, sl] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.qty).toBe("0.01");
        expect(sl.qty).toBe("0.01");
    });

    it("keeps the row's own id, so a cancel can still address the venue's plan", () => {
        const [tp] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.sourceOrderId).toBe("123");
    });

    it("keeps the position id on both legs", () => {
        const plans = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(plans.every((p) => p.positionId === "12345678")).toBe(true);
    });

    it("carries the trigger type each leg was set with", () => {
        const [tp] = normalizeTpSlRow(DOCUMENTED_ROW);
        expect(tp.workingType).toBe("LAST_PRICE");
    });
});

describe("rows carrying only one leg", () => {
    it("produces one plan for a stop-only row, not one plan and one empty", () => {
        const plans = normalizeTpSlRow({
            id: "9",
            symbol: "BTCUSDT",
            slPrice: "55000",
            slQty: "1",
        });
        expect(plans).toHaveLength(1);
        expect(plans[0].planType).toBe("LOSS");
        expect(plans[0].orderId).toBe("9-sl");
    });

    it("produces one plan for a take-profit-only row", () => {
        const plans = normalizeTpSlRow({ id: "9", symbol: "BTCUSDT", tpPrice: "70000" });
        expect(plans).toHaveLength(1);
        expect(plans[0].planType).toBe("PROFIT");
    });

    it("does not invent the missing leg", () => {
        // A stop that the venue does not hold, shown on screen, is worse than
        // no stop shown: the trader believes they are covered.
        const plans = normalizeTpSlRow({ id: "9", symbol: "BTCUSDT", tpPrice: "70000" });
        expect(plans.some((p) => p.planType === "LOSS")).toBe(false);
    });
});

describe("rows that cannot become a plan", () => {
    it("drops a row with neither leg", () => {
        expect(normalizeTpSlRow({ id: "9", symbol: "BTCUSDT" })).toEqual([]);
    });

    it("drops a row with no id to build leg ids from", () => {
        expect(normalizeTpSlRow({ symbol: "BTCUSDT", tpPrice: "70000" })).toEqual([]);
    });

    it("drops a row with no symbol", () => {
        expect(normalizeTpSlRow({ id: "9", tpPrice: "70000" })).toEqual([]);
    });

    it("drops null and non-objects rather than throwing", () => {
        expect(normalizeTpSlRow(null)).toEqual([]);
        expect(normalizeTpSlRow(undefined)).toEqual([]);
        expect(normalizeTpSlRow("nonsense")).toEqual([]);
    });

    it("treats an empty-string price as absent", () => {
        expect(normalizeTpSlRow({ id: "9", symbol: "BTCUSDT", tpPrice: "" })).toEqual([]);
    });
});

describe("id fallbacks", () => {
    it("falls back to orderId when the row has no id", () => {
        const [tp] = normalizeTpSlRow({ orderId: "77", symbol: "BTCUSDT", tpPrice: "70000" });
        expect(tp.orderId).toBe("77-tp");
    });

    it("falls back to planId when it has neither", () => {
        const [tp] = normalizeTpSlRow({ planId: "88", symbol: "BTCUSDT", tpPrice: "70000" });
        expect(tp.orderId).toBe("88-tp");
    });

    it("accepts a numeric id", () => {
        const [tp] = normalizeTpSlRow({ id: 123, symbol: "BTCUSDT", tpPrice: "70000" });
        expect(tp.orderId).toBe("123-tp");
    });
});

describe("rows that are already one leg", () => {
    const alreadySplit = {
        orderId: "123-tp",
        symbol: "BTCUSDT",
        planType: "PROFIT",
        triggerPrice: "50000",
        status: "NEW",
    };

    it("passes a leg-shaped row through untouched", () => {
        // What the WS split and the generic non-Bitunix provider produce.
        expect(normalizeTpSlRow(alreadySplit)).toEqual([alreadySplit]);
    });

    it("is idempotent — normalising twice changes nothing", () => {
        // A normalised list can be re-normalised by a later refetch path; if
        // that doubled the legs, the duplication would be silent.
        const once = normalizeTpSlRow(DOCUMENTED_ROW);
        const twice = normalizeTpSlRows(once);
        expect(twice).toEqual(once);
    });
});

describe("the position-wide versus partial guess", () => {
    it("reads a leg without a quantity as the position-wide plan", () => {
        const [tp] = normalizeTpSlRow({ id: "9", symbol: "BTCUSDT", tpPrice: "70000" });
        expect(tp.scopeGuess).toBe("position");
    });

    it("reads a leg with a quantity as a partial plan", () => {
        const [tp] = normalizeTpSlRow({
            id: "9",
            symbol: "BTCUSDT",
            tpPrice: "70000",
            tpQty: "0.5",
        });
        expect(tp.scopeGuess).toBe("partial");
    });

    it("judges each leg separately", () => {
        // A row can carry a sized take-profit beside an unsized stop; one
        // verdict for the row would be wrong for one of them.
        const [tp, sl] = normalizeTpSlRow({
            id: "9",
            symbol: "BTCUSDT",
            tpPrice: "70000",
            tpQty: "0.5",
            slPrice: "55000",
        });
        expect(tp.scopeGuess).toBe("partial");
        expect(sl.scopeGuess).toBe("position");
    });
});

describe("normalizeTpSlRows", () => {
    it("flattens a whole response", () => {
        const rows = [DOCUMENTED_ROW, { id: "9", symbol: "ETHUSDT", slPrice: "2000" }];
        expect(normalizeTpSlRows(rows)).toHaveLength(3);
    });

    it("skips unusable rows without losing the usable ones", () => {
        const rows = [{ id: "9", symbol: "BTCUSDT" }, DOCUMENTED_ROW, null];
        expect(normalizeTpSlRows(rows)).toHaveLength(2);
    });

    it("produces ids unique enough for the caller's de-duplication", () => {
        const plans = normalizeTpSlRows([DOCUMENTED_ROW]);
        const ids = new Set(plans.map((p) => p.orderId));
        expect(ids.size).toBe(plans.length);
    });
});
