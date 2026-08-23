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

/*
 * FEAT-0057 — the shared TP/SL plan cache.
 *
 * The point of this store is that showing a stop on a position card does not
 * cost a second fetch. Most of what is asserted here is about *not* calling
 * the endpoint.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchTpSl = vi.hoisted(() => vi.fn());
vi.mock("../services/tradeService", () => ({
    tradeService: { fetchTpSlOrders: fetchTpSl },
}));

import { tpSlState, MAX_AGE_MS } from "./tpsl.svelte";
import { normalizeTpSlRows } from "../services/tpslNormalize";

function plan(symbol: string, planType: string, triggerPrice: string, id = "1") {
    return { orderId: `${symbol}-${planType}-${id}`, symbol, planType, triggerPrice, status: "NEW" };
}

beforeEach(() => {
    fetchTpSl.mockReset();
    fetchTpSl.mockResolvedValue([]);
    tpSlState.reset();
});

describe("tpSlState — fetching", () => {
    it("fetches pending plans on first use", async () => {
        fetchTpSl.mockResolvedValue([plan("BTCUSDT", "PROFIT", "60000")]);
        await tpSlState.ensureFresh();

        expect(fetchTpSl).toHaveBeenCalledTimes(1);
        expect(fetchTpSl).toHaveBeenCalledWith("pending");
        expect(tpSlState.orders).toHaveLength(1);
    });

    it("does not refetch inside the cache window", async () => {
        const t0 = 1_000_000;
        await tpSlState.ensureFresh(t0);
        await tpSlState.ensureFresh(t0 + MAX_AGE_MS - 1);
        expect(fetchTpSl).toHaveBeenCalledTimes(1);
    });

    it("refetches once the window has passed", async () => {
        const t0 = 1_000_000;
        await tpSlState.ensureFresh(t0);
        await tpSlState.ensureFresh(t0 + MAX_AGE_MS + 1);
        expect(fetchTpSl).toHaveBeenCalledTimes(2);
    });

    it("collapses concurrent callers into one request", async () => {
        // Both the position cards and the TP/SL tab can ask at the same
        // moment; that must not be two round trips.
        let release: (v: unknown[]) => void = () => {};
        fetchTpSl.mockReturnValue(new Promise((resolve) => (release = resolve)));

        const a = tpSlState.ensureFresh();
        const b = tpSlState.ensureFresh();
        release([plan("BTCUSDT", "LOSS", "45000")]);
        await Promise.all([a, b]);

        expect(fetchTpSl).toHaveBeenCalledTimes(1);
        expect(tpSlState.orders).toHaveLength(1);
    });

    it("refetches after invalidate", async () => {
        const t0 = 1_000_000;
        await tpSlState.ensureFresh(t0);
        tpSlState.invalidate();
        await tpSlState.ensureFresh(t0 + 1);
        expect(fetchTpSl).toHaveBeenCalledTimes(2);
    });

    it("records a failure instead of throwing", async () => {
        fetchTpSl.mockRejectedValue(new Error("network down"));
        // A position card must still render when this endpoint is unavailable.
        await expect(tpSlState.ensureFresh()).resolves.toBeUndefined();
        expect(tpSlState.error).toBe("network down");
        expect(tpSlState.orders).toEqual([]);
    });

    it("retries after a failure rather than caching the emptiness", async () => {
        fetchTpSl.mockRejectedValueOnce(new Error("boom"));
        await tpSlState.ensureFresh(1_000);
        fetchTpSl.mockResolvedValue([plan("BTCUSDT", "PROFIT", "60000")]);
        await tpSlState.ensureFresh(1_001);

        expect(fetchTpSl).toHaveBeenCalledTimes(2);
        expect(tpSlState.orders).toHaveLength(1);
        expect(tpSlState.error).toBeNull();
    });

    it("clears everything on reset", async () => {
        fetchTpSl.mockResolvedValue([plan("BTCUSDT", "PROFIT", "60000")]);
        await tpSlState.ensureFresh();
        tpSlState.reset();
        expect(tpSlState.orders).toEqual([]);
        expect(tpSlState.loadedAt).toBeNull();
    });
});

describe("tpSlState — plansFor", () => {
    beforeEach(async () => {
        fetchTpSl.mockResolvedValue([
            plan("BTCUSDT", "PROFIT", "60000"),
            plan("BTCUSDT", "LOSS", "45000"),
            plan("ETHUSDT", "LOSS", "2800"),
        ]);
        await tpSlState.ensureFresh();
    });

    it("groups a symbol's plans by type", () => {
        const plans = tpSlState.plansFor("BTCUSDT");
        expect(plans.profit?.triggerPrice).toBe("60000");
        expect(plans.loss?.triggerPrice).toBe("45000");
    });

    it("returns only the type a symbol actually has", () => {
        const plans = tpSlState.plansFor("ETHUSDT");
        expect(plans.profit).toBeUndefined();
        expect(plans.loss?.triggerPrice).toBe("2800");
    });

    it("returns an empty object for a symbol with no plans", () => {
        expect(tpSlState.plansFor("SOLUSDT")).toEqual({});
        expect(tpSlState.hasPlansFor("SOLUSDT")).toBe(false);
    });

    it("recognises the plan types Bitunix actually sends", async () => {
        // The endpoint has used both bare and suffixed forms.
        fetchTpSl.mockResolvedValue([
            plan("SOLUSDT", "profit_plan", "200"),
            plan("SOLUSDT", "loss_plan", "150"),
        ]);
        tpSlState.invalidate();
        await tpSlState.ensureFresh();

        const plans = tpSlState.plansFor("SOLUSDT");
        expect(plans.profit?.triggerPrice).toBe("200");
        expect(plans.loss?.triggerPrice).toBe("150");
    });

    it("ignores a plan type it does not recognise rather than guessing", async () => {
        fetchTpSl.mockResolvedValue([plan("SOLUSDT", "something-else", "1")]);
        tpSlState.invalidate();
        await tpSlState.ensureFresh();

        const plans = tpSlState.plansFor("SOLUSDT");
        expect(plans.profit).toBeUndefined();
        expect(plans.loss).toBeUndefined();
        // It is still known to belong to the symbol, so the row is not hidden
        // on the strength of a field this code failed to parse.
        expect(tpSlState.hasPlansFor("SOLUSDT")).toBe(true);
    });

    it("keeps the first plan of each type when the exchange sends several", () => {
        expect(tpSlState.plansFor("BTCUSDT").profit?.orderId).toBe(
            "BTCUSDT-PROFIT-1",
        );
    });
});

describe("tpSlState — updateFromWs (Tp Sl Channel)", () => {
    it("adds a take-profit leg from a push carrying only tpPrice", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "93" });

        const plans = tpSlState.plansFor("SOLUSDT");
        expect(plans.profit?.triggerPrice).toBe("93");
        expect(plans.loss).toBeUndefined();
    });

    it("adds a stop-loss leg from a push carrying only slPrice", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", slPrice: "85" });

        const plans = tpSlState.plansFor("SOLUSDT");
        expect(plans.loss?.triggerPrice).toBe("85");
        expect(plans.profit).toBeUndefined();
    });

    it("fills in the other leg on a later push, without dropping the first", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "93" });
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", slPrice: "85" });

        const plans = tpSlState.plansFor("SOLUSDT");
        expect(plans.profit?.triggerPrice).toBe("93");
        expect(plans.loss?.triggerPrice).toBe("85");
    });

    it("updates a leg's price in place rather than duplicating it", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "93" });
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "95" });

        expect(tpSlState.orders).toHaveLength(1);
        expect(tpSlState.plansFor("SOLUSDT").profit?.triggerPrice).toBe("95");
    });

    it("removes a leg on event CLOSE", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", tpPrice: "93" });
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", event: "CLOSE", tpPrice: "93" });

        expect(tpSlState.plansFor("SOLUSDT").profit).toBeUndefined();
    });

    it("removes a leg once its status is CANCELED or FILLED", () => {
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "NEW", slPrice: "85" });
        tpSlState.updateFromWs({ orderId: "42", symbol: "SOLUSDT", status: "CANCELED", slPrice: "85" });

        expect(tpSlState.plansFor("SOLUSDT").loss).toBeUndefined();
    });

    it("ignores a push with neither an orderId nor a symbol", () => {
        tpSlState.updateFromWs({ tpPrice: "93" });
        expect(tpSlState.orders).toEqual([]);
    });
});

/*
 * BUG-0266 — the regression this file previously could not have caught.
 *
 * Every other test here builds its plans with the `plan()` helper above:
 * `{orderId, symbol, planType, triggerPrice, status}`. Bitunix sends none of
 * those three middle fields — its rows carry `id`, `tpPrice` and `slPrice`,
 * and no `planType` at all. So the store's grouping was proven correct on a
 * shape it never receives, and against live data `plansFor()` returned nothing
 * for every symbol.
 *
 * These tests feed the documented response through the same normalisation the
 * fetch path applies, so they fail if that split is removed or renamed.
 */
describe("tpSlState — against the venue's actual response shape (BUG-0266)", () => {
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

    it("finds both plans for a position the venue reports as covered", async () => {
        fetchTpSl.mockResolvedValue(normalizeTpSlRows([DOCUMENTED_ROW]));
        await tpSlState.ensureFresh();

        const plans = tpSlState.plansFor("BTCUSDT");
        expect(plans.profit?.triggerPrice).toBe("50000");
        expect(plans.loss?.triggerPrice).toBe("70000");
    });

    it("reports the symbol as having plans", async () => {
        // What a create-vs-edit decision asks. It answered false for every
        // covered position before the split existed.
        fetchTpSl.mockResolvedValue(normalizeTpSlRows([DOCUMENTED_ROW]));
        await tpSlState.ensureFresh();

        expect(tpSlState.hasPlansFor("BTCUSDT")).toBe(true);
    });

    it("lets a live push update the fetched leg instead of duplicating it", async () => {
        // The reason the leg id scheme has to match `updateFromWs`: the WS
        // push names the leg `${orderId}-tp`, and the fetch has to have used
        // the same name or the list ends up holding both.
        fetchTpSl.mockResolvedValue(normalizeTpSlRows([DOCUMENTED_ROW]));
        await tpSlState.ensureFresh();
        expect(tpSlState.orders).toHaveLength(2);

        tpSlState.updateFromWs({
            orderId: "123",
            symbol: "BTCUSDT",
            tpPrice: "51000",
            status: "NEW",
        });

        expect(tpSlState.orders).toHaveLength(2);
        expect(tpSlState.plansFor("BTCUSDT").profit?.triggerPrice).toBe("51000");
    });

    it("keeps the venue's own row id, so an edit can still address the plan", async () => {
        fetchTpSl.mockResolvedValue(normalizeTpSlRows([DOCUMENTED_ROW]));
        await tpSlState.ensureFresh();

        expect(tpSlState.plansFor("BTCUSDT").profit?.sourceOrderId).toBe("123");
    });
});
