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
 * BUG-0512 — the mark price carries its own age stamp.
 *
 * `lastUpdated` refreshes on any channel's traffic, so it cannot say how old
 * the mark price is. `markPriceUpdatedAt` is stamped only when a real mark
 * value arrives; an explicit `undefined` (e.g. an index-price-only WS tick)
 * keeps both the old price and the old stamp.
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

describe("applyUpdate markPriceUpdatedAt", () => {
    let store: Record<string, MarketData>;

    beforeEach(() => {
        store = {};
    });

    it("stamps the mark age when a real mark value arrives", () => {
        const before = Date.now();
        applyUpdate(makeManager(store), "BTCUSDT", { markPrice: new Decimal("60000") });

        expect(store["BTCUSDT"].markPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].markPriceUpdatedAt).toBeGreaterThanOrEqual(before);
        expect(store["BTCUSDT"].markPriceUpdatedAt).toBeLessThanOrEqual(Date.now());
    });

    it("leaves price and stamp alone on an explicit undefined mark", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { markPrice: new Decimal("60000") });
        const stamped = store["BTCUSDT"].markPriceUpdatedAt;

        applyUpdate(makeManager(store), "BTCUSDT", {
            indexPrice: new Decimal("60001"),
            markPrice: undefined,
        });

        // Other traffic still stamps the object ...
        expect(store["BTCUSDT"].lastUpdated).toBeDefined();
        // ... but the mark did not get fresher.
        expect(store["BTCUSDT"].markPrice?.toString()).toBe("60000");
        expect(store["BTCUSDT"].markPriceUpdatedAt).toBe(stamped);
    });

    it("does not stamp when no mark field is present at all", () => {
        applyUpdate(makeManager(store), "BTCUSDT", { lastPrice: new Decimal("60001") });

        expect(store["BTCUSDT"].markPriceUpdatedAt).toBeUndefined();
    });
});
