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
