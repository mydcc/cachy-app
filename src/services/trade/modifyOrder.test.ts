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
 * The port contract for the modify-order lane.
 *
 * `tradeService_modifyOrder*.test.ts` cover the amend through the
 * `tradeService` singleton with the store layer mocked. That cannot reach
 * this module's own seams: whether the qty backfill differs by venue, or
 * whether a corrupt price refuses typed instead of throwing raw past the
 * gate. Injecting the ports is what makes those observable — every sibling
 * module in this directory already ships a suite of its own for the same
 * reason.
 */

import { describe, it, expect, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    createModifyOrderService,
    type ModifyOrderPorts,
} from "./modifyOrder";
import { OrderRefusedError } from "../orderGate";
import type { NormalizedOrder } from "../../types/exchange";

function liveOrder(): NormalizedOrder {
    return {
        id: "o1",
        orderId: "o1",
        clientId: "c1",
        symbol: "BTCUSDT",
        type: "limit",
        side: "long",
        price: "50000",
        amount: "0.5",
        filled: "0",
        status: "open",
        time: 1,
        fee: "0",
        realizedPNL: "0",
    };
}

/**
 * Ports that fail loudly on anything they are not supposed to reach, so an
 * unexpected call is an assertion failure rather than a silent pass.
 *
 * Typed as `ModifyOrderPorts` with no cast: adding a required port to the
 * interface fails compilation here until a default is added, which is the
 * point — a new dependency must be a conscious choice, not a silent import.
 */
function ports(overrides: Partial<ModifyOrderPorts> = {}): ModifyOrderPorts {
    return {
        getOrderDetail: async () => {
            throw new Error("unexpected getOrderDetail");
        },
        gatedRequest: async () => {
            throw new Error("unexpected gatedRequest");
        },
        activeVenue: () => "bitunix",
        accountSizeText: () => "10000",
        ...overrides,
    };
}

describe("modifyOrder lane", () => {
    it("refuses without an order reference before reading anything", async () => {
        const getOrderDetail = vi.fn();
        const svc = createModifyOrderService(ports({ getOrderDetail }));

        await expect(svc.modifyOrder({ symbol: "BTCUSDT" })).rejects.toThrow(
            "Either orderId or clientId must be provided to modify order",
        );
        expect(getOrderDetail).not.toHaveBeenCalled();
    });

    it("backfills qty from the live order on bitunix", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createModifyOrderService(
            ports({
                getOrderDetail: async () => liveOrder(),
                gatedRequest,
                activeVenue: () => "bitunix",
            }),
        );

        // Price-only amend: Bitunix requires qty, so the lane carries the
        // resting size rather than letting the venue refuse the amend.
        await svc.modifyOrder({ orderId: "o1", price: new Decimal("51000") });

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["qty"]).toBe("0.5");
        expect(intent.payload["price"]).toBe("51000");
    });

    it("omits qty on a bitget price-only amend", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createModifyOrderService(
            ports({
                getOrderDetail: async () => liveOrder(),
                gatedRequest,
                activeVenue: () => "bitget",
            }),
        );

        // Whether UTA qty replaces or adds is unverified, so under either
        // semantics omitting it on a price-only amend is the safe shape. The
        // key stays present with an undefined value (verbatim from the lane:
        // the payload is built with `qty,` unconditionally) — what matters
        // is that no quantity travels.
        await svc.modifyOrder({ orderId: "o1", price: new Decimal("51000") });

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { payload: Record<string, unknown> };
        expect(intent.payload["qty"]).toBeUndefined();
        expect(intent.payload["price"]).toBe("51000");
    });

    it("refuses a corrupt price typed instead of throwing raw past the gate", async () => {
        const gatedRequest = vi.fn();
        const svc = createModifyOrderService(
            ports({ getOrderDetail: async () => liveOrder(), gatedRequest }),
        );

        await expect(
            svc.modifyOrder({ orderId: "o1", price: "not-a-price" }),
        ).rejects.toBeInstanceOf(OrderRefusedError);
        expect(gatedRequest).not.toHaveBeenCalled();
    });

    it("hands the gate the resting size and equity for the cap checks", async () => {
        const seen: unknown[] = [];
        const gatedRequest = vi.fn().mockImplementation(async (intent: unknown) => {
            seen.push(intent);
            return { code: "0" };
        });
        const svc = createModifyOrderService(
            ports({
                getOrderDetail: async () => liveOrder(),
                gatedRequest,
                accountSizeText: () => "10000",
            }),
        );

        await svc.modifyOrder({ orderId: "o1", qty: new Decimal("0.7") });

        expect(seen).toHaveLength(1);
        const intent = seen[0] as { displayed: Record<string, unknown> };
        // The gate only knows an amend enlarges exposure by comparing the
        // new quantity against the resting one — both must travel.
        expect((intent.displayed["modifyQuantity"] as Decimal).toString()).toBe("0.7");
        expect((intent.displayed["previousQuantity"] as Decimal).toString()).toBe("0.5");
        expect((intent.displayed["accountSize"] as Decimal).toString()).toBe("10000");
    });
});
