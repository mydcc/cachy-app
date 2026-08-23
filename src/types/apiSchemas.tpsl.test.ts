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
 * FEAT-0070 — the create-request schema.
 *
 * These rules are Bitunix's, and they are enforced here rather than left to
 * the venue because of how the venue reports a violation: a numeric code and
 * a terse message, which reaches the trader as a failed order with no
 * indication of which field was wrong. A plan that silently fails to be
 * created is a position left unprotected.
 */

import { describe, it, expect } from "vitest";
import { TpSlRequestSchema } from "./apiSchemas";

const BASE = { exchange: "bitunix" as const };

function placePosition(params: Record<string, unknown>) {
    return TpSlRequestSchema.safeParse({
        ...BASE,
        action: "place-position",
        params: { symbol: "BTCUSDT", positionId: "pos-1", ...params },
    });
}

function place(params: Record<string, unknown>) {
    return TpSlRequestSchema.safeParse({
        ...BASE,
        action: "place",
        params: { symbol: "BTCUSDT", positionId: "pos-1", ...params },
    });
}

describe("place-position request", () => {
    it("accepts a take-profit alone", () => {
        expect(placePosition({ tpPrice: "70000" }).success).toBe(true);
    });

    it("accepts a stop-loss alone", () => {
        expect(placePosition({ slPrice: "55000" }).success).toBe(true);
    });

    it("accepts both legs", () => {
        expect(placePosition({ tpPrice: "70000", slPrice: "55000" }).success).toBe(true);
    });

    it("rejects a plan with neither leg", () => {
        // The venue would take this and create nothing.
        expect(placePosition({}).success).toBe(false);
    });

    it("rejects a missing positionId", () => {
        const result = TpSlRequestSchema.safeParse({
            ...BASE,
            action: "place-position",
            params: { symbol: "BTCUSDT", tpPrice: "70000" },
        });
        expect(result.success).toBe(false);
    });

    it("rejects a trigger type the API does not define", () => {
        expect(placePosition({ tpPrice: "70000", tpStopType: "INDEX_PRICE" }).success).toBe(false);
    });

    it("does not accept a quantity — that is the other endpoint", () => {
        // Not a passthrough object, so tpQty here would be dropped silently
        // and the trader would get a position-wide plan they did not ask for.
        const result = placePosition({ tpPrice: "70000", tpQty: "0.5" });
        expect(result.success).toBe(true);
        expect("tpQty" in (result.success ? result.data.params : {})).toBe(false);
    });
});

describe("place request", () => {
    it("accepts a take-profit leg with its quantity", () => {
        expect(place({ tpPrice: "70000", tpQty: "0.5" }).success).toBe(true);
    });

    it("rejects a price without its quantity", () => {
        // The mistake that matters: the venue would size the leg itself.
        expect(place({ tpPrice: "70000" }).success).toBe(false);
    });

    it("rejects a quantity without its price", () => {
        expect(place({ tpQty: "0.5" }).success).toBe(false);
    });

    it("rejects a stop-loss price without its quantity", () => {
        expect(place({ tpPrice: "70000", tpQty: "0.5", slPrice: "55000" }).success).toBe(false);
    });

    it("accepts both legs when both are complete", () => {
        expect(
            place({ tpPrice: "70000", tpQty: "0.5", slPrice: "55000", slQty: "1" }).success,
        ).toBe(true);
    });

    it("accepts a limit leg with its order price", () => {
        expect(
            place({
                tpPrice: "70000",
                tpQty: "0.5",
                tpOrderType: "LIMIT",
                tpOrderPrice: "69950",
            }).success,
        ).toBe(true);
    });

    it("rejects an order type the API does not define", () => {
        expect(
            place({ tpPrice: "70000", tpQty: "0.5", tpOrderType: "STOP" }).success,
        ).toBe(false);
    });
});

describe("the discriminated union still routes the existing actions", () => {
    it("keeps modify working", () => {
        const result = TpSlRequestSchema.safeParse({
            ...BASE,
            action: "modify",
            params: {
                orderId: "1",
                symbol: "BTCUSDT",
                planType: "PROFIT",
                triggerPrice: "70000",
            },
        });
        expect(result.success).toBe(true);
    });

    it("keeps cancel working", () => {
        const result = TpSlRequestSchema.safeParse({
            ...BASE,
            action: "cancel",
            params: { orderId: "1", symbol: "BTCUSDT" },
        });
        expect(result.success).toBe(true);
    });

    it("still rejects an unknown action", () => {
        const result = TpSlRequestSchema.safeParse({
            ...BASE,
            action: "obliterate",
            params: { symbol: "BTCUSDT" },
        });
        expect(result.success).toBe(false);
    });
});
