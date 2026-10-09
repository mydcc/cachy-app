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
 * The port contract for the open lane.
 *
 * The facade suites cover the open through the `tradeService` singleton.
 * That cannot reach this module's own seams: whether the quantity is
 * rounded to the step before it travels, whether the venue-specific fields
 * land only on their venue, and whether the venue is read exactly once for
 * both decisions. Injecting the ports is what makes those observable.
 */

import { describe, it, expect, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    createPlaceOrderService,
    newClientOrderId,
    type PlaceOrderPorts,
} from "./placeOrder";
import type { PlaceOrderParams } from "./tradeParams";

function params(overrides: Partial<PlaceOrderParams> = {}): PlaceOrderParams {
    return {
        symbol: "BTCUSDT",
        side: "BUY",
        origin: "manual",
        qty: new Decimal("0.1234"),
        displayed: {
            accountSize: new Decimal(10000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49000),
        },
        ...overrides,
    };
}

/**
 * Ports that fail loudly on anything they are not supposed to reach, so an
 * unexpected call is an assertion failure rather than a silent pass.
 *
 * Typed as `PlaceOrderPorts` with no cast: adding a required port to the
 * interface fails compilation here until a default is added, which is the
 * point — a new dependency must be a conscious choice, not a silent import.
 */
function ports(overrides: Partial<PlaceOrderPorts> = {}): PlaceOrderPorts {
    return {
        gatedRequest: () => {
            throw new Error("unexpected gatedRequest");
        },
        effectFor: (effect) => effect,
        bitgetUtaOpenFields: () => {
            throw new Error("unexpected bitgetUtaOpenFields");
        },
        activeVenue: () => "bitunix",
        lookupSymbolMeta: () => undefined,
        usdtBalance: () => undefined,
        ...overrides,
    };
}

describe("placeOrder lane", () => {
    it("mints a retry-reusable client id when none is given", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createPlaceOrderService(ports({ gatedRequest }));

        const { clientId } = await svc.placeOrder(params());

        expect(clientId).toMatch(/^cachy-/);
        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["clientId"]).toBe(clientId);
    });

    it("reuses a given client id instead of minting a new one", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createPlaceOrderService(ports({ gatedRequest }));

        const { clientId } = await svc.placeOrder(params({ clientId: "retry-1" }));

        expect(clientId).toBe("retry-1");
        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["clientId"]).toBe("retry-1");
    });

    it("rounds the quantity to the step and hands the gate metadata plus balance", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createPlaceOrderService(
            ports({
                gatedRequest,
                effectFor: () => "GTC",
                lookupSymbolMeta: () => ({
                    symbol: "BTCUSDT",
                    basePrecision: 3,
                    minTradeVolume: new Decimal("0.001"),
                }),
                usdtBalance: () => ({ available: new Decimal(5000), at: 123 }),
            }),
        );

        await svc.placeOrder(params({ orderType: "LIMIT", price: new Decimal(50000) }));

        expect(seen).toHaveLength(1);
        const intent = seen[0] as {
            payload: Record<string, unknown>;
            displayed: Record<string, unknown>;
        };
        // 0.1234 floored to the 0.001 step travels as 0.123.
        expect(intent.payload["qty"]).toBe("0.123");
        expect(intent.payload["effect"]).toBe("GTC");
        expect(intent.displayed["availableMargin"]).toBeInstanceOf(Decimal);
        expect(intent.displayed["availableMarginAt"]).toBe(123);
        expect(intent.displayed["minTradeVolume"]).toBeInstanceOf(Decimal);
    });

    it("adds UTA open fields on bitget only, from a single venue read", async () => {
        const seen: unknown[] = [];
        const activeVenue = vi.fn(() => "bitget" as const);
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createPlaceOrderService(
            ports({
                gatedRequest,
                activeVenue,
                bitgetUtaOpenFields: (direction) => ({
                    posSide: direction === "BUY" ? ("LONG" as const) : ("SHORT" as const),
                    marginMode: "CROSS",
                }),
            }),
        );

        await svc.placeOrder(params());

        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["posSide"]).toBe("LONG");
        expect(intent.payload["marginMode"]).toBe("CROSS");
        // One decision, one read: the envelope branch and the UTA spread
        // must agree, so the venue is read exactly once per open.
        expect(activeVenue).toHaveBeenCalledTimes(1);
    });

    it("sends no UTA fields on bitunix", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const bitgetUtaOpenFields = vi.fn();
        const svc = createPlaceOrderService(
            ports({ gatedRequest, bitgetUtaOpenFields }),
        );

        await svc.placeOrder(params());

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload).not.toHaveProperty("posSide");
        expect(bitgetUtaOpenFields).not.toHaveBeenCalled();
    });

    it("carries the take-profit and stop order prices when stated", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createPlaceOrderService(ports({ gatedRequest }));

        // A silently dropped TP order price leaves the leg unprotected —
        // the carryover is pinned, not assumed.
        await svc.placeOrder(
            params({
                takeProfit: { price: new Decimal(55000), orderPrice: new Decimal(54900) },
                stopLoss: { price: new Decimal(49000) },
            }),
        );

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["tpPrice"]).toBe("55000");
        expect(intent.payload["tpOrderPrice"]).toBe("54900");
        expect(intent.payload["slPrice"]).toBe("49000");
        expect(intent.payload).not.toHaveProperty("slOrderPrice");
    });
});

describe("newClientOrderId", () => {
    it("mints unique attempt ids", () => {
        const a = newClientOrderId();
        const b = newClientOrderId();
        expect(a).toMatch(/^cachy-/);
        expect(b).toMatch(/^cachy-/);
        expect(a).not.toBe(b);
    });
});
