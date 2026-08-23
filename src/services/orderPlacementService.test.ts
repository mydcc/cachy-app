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
 * FEAT-0021 — placing an entry together with its protection.
 *
 * The important tests here are the ones about the entry surviving. The item
 * calls rollback semantics its most consequential question, and the answer —
 * never auto-close, report loudly — is only worth anything if it is asserted.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const placeOrder = vi.hoisted(() => vi.fn());
const closePosition = vi.hoisted(() => vi.fn());
const flashClose = vi.hoisted(() => vi.fn());
vi.mock("./tradeService", () => ({
    tradeService: {
        placeOrder,
        closePosition,
        flashClosePosition: flashClose,
    },
}));

// Driven by plain hoisted state rather than spies: a spyOn against a mocked
// module survives clearAllMocks and leaks its implementation into every test
// after it, which is how this file's first draft passed for the wrong reason.
const plans = vi.hoisted(() => ({
    value: {} as Record<string, unknown>,
    looks: 0,
    onLook: null as null | ((n: number) => void),
}));
vi.mock("../stores/tpsl.svelte", () => ({
    tpSlState: {
        invalidate: () => {},
        ensureFresh: async () => {
            plans.looks += 1;
            plans.onLook?.(plans.looks);
        },
        plansFor: () => plans.value,
    },
}));

import { orderPlacementService, STOP_RETRY_DELAY_MS, type EntryPlan } from "./orderPlacementService";
import { OrderRefusedError } from "./orderGate";

function plan(overrides: Partial<EntryPlan> = {}): EntryPlan {
    return {
        exchange: "bitunix",
        symbol: "BTCUSDT",
        tradeType: "long",
        entryType: "market",
        qty: new Decimal("0.02"),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49500),
        takeProfits: [new Decimal(51000)],
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(10),
        marginMode: "ISOLATED",
        accountStateAt: Date.now(),
        ...overrides,
    };
}

beforeEach(() => {
    placeOrder.mockReset();
    closePosition.mockReset();
    flashClose.mockReset();
    placeOrder.mockResolvedValue({ clientId: "cachy-abc", result: {} });
    // By default the exchange did what it was told.
    plans.value = { loss: { triggerPrice: "49500" }, profit: { triggerPrice: "51000" } };
    plans.looks = 0;
    plans.onLook = null;
});

afterEach(() => {
    vi.restoreAllMocks();
    plans.onLook = null;
});

describe("FEAT-0021 — the happy path", () => {
    it("places entry, stop and target in one request on Bitunix", async () => {
        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(placeOrder).toHaveBeenCalledTimes(1);
        const args = placeOrder.mock.calls[0][0];
        expect(args.stopLoss.price.eq(49500)).toBe(true);
        expect(args.takeProfit.price.eq(51000)).toBe(true);

        expect(result).toMatchObject({
            entryPlaced: true,
            stopLoss: "attached",
            takeProfit: "attached",
            unprotected: false,
        });
    });

    it("maps a short to a SELL", async () => {
        await orderPlacementService.placeEntryGroup(plan({ tradeType: "short" }));
        expect(placeOrder.mock.calls[0][0].side).toBe("SELL");
    });

    it("sends a limit order with its time in force, and a market order without", async () => {
        await orderPlacementService.placeEntryGroup(
            plan({ entryType: "limit", timeInForce: "POST_ONLY" }),
        );
        expect(placeOrder.mock.calls[0][0]).toMatchObject({
            orderType: "LIMIT",
            effect: "POST_ONLY",
        });

        placeOrder.mockClear();
        await orderPlacementService.placeEntryGroup(plan({ entryType: "market" }));
        expect(placeOrder.mock.calls[0][0].orderType).toBe("MARKET");
        expect(placeOrder.mock.calls[0][0].effect).toBeUndefined();
        expect(placeOrder.mock.calls[0][0].price).toBeUndefined();
    });

    it("returns the attempt id so a caller can retry idempotently", async () => {
        const result = await orderPlacementService.placeEntryGroup(plan());
        expect(result.clientId).toBe("cachy-abc");
    });
});

// AC: "A partially placed order group (entry filled, stop rejected) is
// detected and reported, with a test."
describe("FEAT-0021 — entry filled, stop missing", () => {
    beforeEach(() => {
        // The request succeeded and the stop is not there. This is what a
        // silently-dropped attached stop looks like: place_order returns only
        // an order id, so nothing about the response gives it away.
        plans.value = { profit: { triggerPrice: "51000" } };
    });

    it("detects it and reports the position as unprotected", async () => {
        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.entryPlaced).toBe(true);
        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
        expect(result.errorKey).toBe("orderEntry.errors.unprotected");
    });

    it("never closes the position to fix it", async () => {
        await orderPlacementService.placeEntryGroup(plan());

        // The rollback decision, asserted. Closing here would realise a loss
        // the trader never chose, on the strength of a possibly transient
        // error — see FEAT-0013's reasoning on the kill switch.
        expect(closePosition).not.toHaveBeenCalled();
        expect(flashClose).not.toHaveBeenCalled();
    });

    it("does not place a second entry while retrying the stop", async () => {
        await orderPlacementService.placeEntryGroup(plan());
        // Doubling the position while trying to protect it would be the worst
        // possible reading of "retry".
        expect(placeOrder).toHaveBeenCalledTimes(1);
    });

    it("waits before retrying, instead of re-checking instantly", async () => {
        // The exchange attaches a bracket stop asynchronously — checking
        // again immediately always lost that race (see STOP_RETRY_DELAY_MS's
        // own comment). This proves the wait actually happens rather than
        // relying on real-clock timing in the other tests here.
        vi.useFakeTimers();
        try {
            const resultPromise = orderPlacementService.placeEntryGroup(plan());
            await vi.advanceTimersByTimeAsync(0);
            expect(plans.looks).toBe(1);

            await vi.advanceTimersByTimeAsync(STOP_RETRY_DELAY_MS - 1);
            expect(plans.looks).toBe(1);

            await vi.advanceTimersByTimeAsync(1);
            expect(plans.looks).toBe(2);

            await vi.advanceTimersByTimeAsync(STOP_RETRY_DELAY_MS);
            await resultPromise;
        } finally {
            vi.useRealTimers();
        }
    });

    it("recovers if the stop turns up on a retry", async () => {
        plans.onLook = (n) => {
            // Second look finds it — the exchange was just slow to publish.
            if (n >= 2) {
                plans.value = {
                    loss: { triggerPrice: "49500" },
                    profit: { triggerPrice: "51000" },
                };
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());
        expect(result.unprotected).toBe(false);
        expect(result.stopLoss).toBe("attached");
        expect(plans.looks).toBeGreaterThan(1);
    });
});

describe("FEAT-0021 — entry filled, target missing", () => {
    it("reports it without calling the position unprotected", async () => {
        plans.value = { loss: { triggerPrice: "49500" } };
        const result = await orderPlacementService.placeEntryGroup(plan());

        // A missing target costs upside; a missing stop costs capital. They
        // are not the same event and are not reported as one.
        expect(result.takeProfit).toBe("failed");
        expect(result.stopLoss).toBe("attached");
        expect(result.unprotected).toBe(false);
        expect(result.errorKey).toBe("orderEntry.errors.targetMissing");
    });
});

describe("FEAT-0021 — the entry itself fails", () => {
    it("reports a gate refusal as itself, with nothing unprotected", async () => {
        placeOrder.mockRejectedValue(
            new OrderRefusedError({
                field: "qty",
                reason: "sizeMismatch",
                messageKey: "orderGate.sizeMismatch",
                values: {},
            }),
        );

        const result = await orderPlacementService.placeEntryGroup(plan());
        expect(result.entryPlaced).toBe(false);
        // Nothing was sent, so nothing is exposed.
        expect(result.unprotected).toBe(false);
        expect(result.errorKey).toBe("orderGate.sizeMismatch");
    });

    it("passes the refusal through whole, not just its message key", async () => {
        // The gate's messages interpolate the field and the numbers that
        // disagreed. Keeping only `errorKey` leaves a caller with a template
        // and nothing to fill it, which renders as literal {field} on screen.
        placeOrder.mockRejectedValue(
            new OrderRefusedError({
                field: "accountState",
                reason: "stale",
                messageKey: "orderGate.stale",
                values: { field: "accountState", age: "120", max: "60" },
            }),
        );

        const result = await orderPlacementService.placeEntryGroup(plan());
        expect(result.refusal?.values).toEqual({
            field: "accountState",
            age: "120",
            max: "60",
        });
    });

    it("leaves refusal unset when the exchange, not the gate, said no", async () => {
        placeOrder.mockRejectedValue(new Error("insufficient margin"));
        const result = await orderPlacementService.placeEntryGroup(plan());
        expect(result.refusal).toBeUndefined();
    });

    it("reports an exchange rejection", async () => {
        placeOrder.mockRejectedValue(new Error("insufficient margin"));
        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.entryPlaced).toBe(false);
        expect(result.errorKey).toBe("orderEntry.errors.entryRejected");
        expect(result.errorDetail).toContain("insufficient margin");
    });

    it("does not go looking for protection that cannot exist", async () => {
        placeOrder.mockRejectedValue(new Error("nope"));
        await orderPlacementService.placeEntryGroup(plan());
        expect(plans.looks).toBe(0);
    });
});

describe("FEAT-0021 — exchanges that cannot attach protection", () => {
    it("does not send tp/sl with the entry on Bitget", async () => {
        await orderPlacementService.placeEntryGroup(plan({ exchange: "bitget" }));

        const args = placeOrder.mock.calls[0][0];
        expect(args.stopLoss).toBeUndefined();
        expect(args.takeProfit).toBeUndefined();
    });

    it("still reports the position unprotected when the stop never lands", async () => {
        plans.value = {};
        const result = await orderPlacementService.placeEntryGroup(
            plan({ exchange: "bitget" }),
        );
        expect(result.unprotected).toBe(true);
        expect(closePosition).not.toHaveBeenCalled();
    });
});

describe("FEAT-0021 — an entry with no protection requested", () => {
    it("is not reported as unprotected", async () => {
        const result = await orderPlacementService.placeEntryGroup(
            plan({ stopLossPrice: new Decimal(0), takeProfits: [] }),
        );

        // The trader asked for no stop. That is their choice to make; this
        // module reports a *broken promise*, not an absent one.
        expect(result.entryPlaced).toBe(true);
        expect(result.stopLoss).toBe("none");
        expect(result.unprotected).toBe(false);
    });
});
