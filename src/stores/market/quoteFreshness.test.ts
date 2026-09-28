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

/*
 * BUG-0558 — the last price carries its own age stamp and source.
 *
 * `lastUpdated` refreshes on any channel's traffic (klines, depth), so it
 * cannot tell a live quote from a frozen one. `lastPriceUpdatedAt` is
 * stamped only when a real last-price value arrives, and `lastPriceSource`
 * records whether the WS tick or the REST gap-bridge wrote it. A sourceless
 * update (technicals, depth, funding) keeps price, stamp AND source — the
 * price did not get fresher.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Decimal } from "decimal.js";
import { applyUpdate } from "./applyUpdate";
import type { MarketData } from "./types";

function makeManager(store: Record<string, MarketData>) {
    return {
        touchSymbol: () => {},
        getOrCreateSymbol: (symbol: string) => {
            store[symbol] ??= {
                symbol,
                lastPrice: null,
                indexPrice: null,
                markPrice: null,
                fundingRate: null,
                nextFundingTime: null,
                klines: {},
            };
            return store[symbol];
        },
    } as never;
}

describe("applyUpdate lastPriceUpdatedAt/lastPriceSource", () => {
    let store: Record<string, MarketData>;

    beforeEach(() => {
        store = {};
    });

    it("stamps age and ws source when a real WS value arrives", () => {
        const before = Date.now();
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "ws");

        expect(store["BTCUSDT"].lastPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBeGreaterThanOrEqual(before);
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBeLessThanOrEqual(Date.now());
        expect(store["BTCUSDT"].lastPriceSource).toBe("ws");
    });

    it("stamps the rest source on a gap-bridge update", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "rest");

        expect(store["BTCUSDT"].lastPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].lastPriceSource).toBe("rest");
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBeDefined();
    });

    it("lets a newer WS tick relabel a bridged price", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "rest");
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60001") }, "ws");

        expect(store["BTCUSDT"].lastPrice?.toString()).toBe("60001");
        expect(store["BTCUSDT"].lastPriceSource).toBe("ws");
    });

    it("keeps price, stamp and source on a sourceless technicals update", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "ws");
        const stamped = store["BTCUSDT"].lastPriceUpdatedAt;

        applyUpdate(makeManager(store), "BTCUSDT", {
            technicals: { "1h": { oscillators: [] } },
        } as never);

        expect(store["BTCUSDT"].lastPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBe(stamped);
        expect(store["BTCUSDT"].lastPriceSource).toBe("ws");
    });

    it("leaves price and stamp alone on an explicit undefined lastPrice", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "ws");
        const stamped = store["BTCUSDT"].lastPriceUpdatedAt;

        applyUpdate(makeManager(store), "BTCUSDT", {
            indexPrice: new Decimal("60001"),
            lastPrice: undefined,
        });

        expect(store["BTCUSDT"].lastPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBe(stamped);
    });

    it("clears the price on null without refreshing the stamp", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60000") }, "ws");
        const stamped = store["BTCUSDT"].lastPriceUpdatedAt;

        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: null }, "ws");

        expect(store["BTCUSDT"].lastPrice).toBeNull();
        expect(store["BTCUSDT"].lastPriceUpdatedAt).toBe(stamped);
    });
});
