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

const loggerError = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: loggerWarn, error: loggerError, debug: vi.fn() },
}));

const placeOrder = vi.hoisted(() => vi.fn());
const closePosition = vi.hoisted(() => vi.fn());
const flashClose = vi.hoisted(() => vi.fn());
const placePositionTpSl = vi.hoisted(() => vi.fn());
vi.mock("./tradeService", () => ({
    tradeService: {
        placeOrder,
        closePosition,
        flashClosePosition: flashClose,
        placePositionTpSl,
    },
}));

/*
 * BUG-0503 divergence cover: no venue declares attach=false with
 * standalone=true today, so the `replaceStop` flag swap is unobservable
 * through real declarations alone. This mock lets one test declare that
 * combination. Delegates to the real lookup by default, so every other
 * test in this file reads the true table; the diverging test overrides
 * within itself and the shared `beforeEach` below re-establishes the
 * delegation (after `restoreAllMocks`, whatever it does to the wrapper).
 */
const capsDouble = vi.hoisted(() => ({
    real: null as null | ((exchange: string) => import("./exchange/capabilityTypes").ExchangeCapabilities),
    mock: null as null | ReturnType<typeof vi.fn>,
}));
vi.mock("./exchangeCapabilities", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("./exchangeCapabilities")>();
    capsDouble.real = actual.capabilitiesOf;
    capsDouble.mock = vi.fn((exchange: string) => capsDouble.real!(exchange));
    return { ...actual, capabilitiesOf: capsDouble.mock };
});

// Driven by plain hoisted state rather than spies: a spyOn against a mocked
// module survives clearAllMocks and leaks its implementation into every test
// after it, which is how this file's first draft passed for the wrong reason.
const plans = vi.hoisted(() => ({
    value: {} as Record<string, unknown>,
    // BUG-0524 — extra plans beside the {loss, profit} pair above, for
    // symbols holding more than one plan per leg (hedge, both sides).
    extra: [] as Array<Record<string, unknown>>,
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
        // Production legs always carry planType (normalize + WS set it);
        // the legacy pair above predates that, so it is stamped here.
        ordersFor: () => [
            ...(plans.value.loss
                ? [{ ...(plans.value.loss as Record<string, unknown>), planType: "LOSS" }]
                : []),
            ...(plans.value.profit
                ? [{ ...(plans.value.profit as Record<string, unknown>), planType: "PROFIT" }]
                : []),
            ...plans.extra,
        ],
    },
}));

const account = vi.hoisted(() => ({
    positions: [] as Array<{ positionId: string; symbol: string; side: string }>,
    requestSync: vi.fn(),
}));
vi.mock("../stores/account.svelte", () => ({ accountState: account }));

import {
    orderPlacementService,
    POSITION_ID_RESOLVE_BUDGET_MS,
    STOP_RETRY_DELAY_MS,
    type EntryPlan
} from "./orderPlacementService";
import { OrderRefusedError } from "./orderGate";

function plan(overrides: Partial<EntryPlan> = {}): EntryPlan {
    return {
        exchange: "bitunix",
        symbol: "BTCUSDT",
        // BUG-0494 — existing cases exercise manual flows; the provenance is
        // stated so the required field does not change what they assert.
        origin: "manual",
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
    placePositionTpSl.mockReset();
    account.requestSync.mockReset();
    // Back to the true capability table (see the `capsDouble` mock above).
    capsDouble.mock?.mockReset();
    capsDouble.mock?.mockImplementation((exchange: string) => capsDouble.real!(exchange));
    account.positions = [];
    placeOrder.mockResolvedValue({ clientId: "cachy-abc", result: {} });
    // By default the exchange did what it was told.
    plans.value = { loss: { triggerPrice: "49500" }, profit: { triggerPrice: "51000" } };
    plans.extra = [];
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

            // Re-placement first polls for the fresh position's id (its own
            // fake-clock budget, see POSITION_ID_RESOLVE_BUDGET_MS) before the
            // retry window starts. One tick short proves the wait happened.
            await vi.advanceTimersByTimeAsync(
                POSITION_ID_RESOLVE_BUDGET_MS + STOP_RETRY_DELAY_MS - 1
            );
            expect(plans.looks).toBe(1);

            await vi.advanceTimersByTimeAsync(1);
            expect(plans.looks).toBe(2);

            // A second look still misses, so re-placement polls again before
            // the final check — the full budget repeats once more.
            await vi.advanceTimersByTimeAsync(
                POSITION_ID_RESOLVE_BUDGET_MS + STOP_RETRY_DELAY_MS
            );
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

/*
 * BUG-0290 — the retry path re-places the stop instead of logging that it
 * cannot. The verification window (the venue attaches the entry-borne stop
 * asynchronously) stays exactly as it was; what changed is that a missing
 * stop now triggers a real position-wide TP/SL placement.
 */
describe("BUG-0290 — stop retry re-places the stop", () => {
    beforeEach(() => {
        plans.value = { profit: { triggerPrice: "51000" } };
    });

    it("calls the position TP/SL placement while retrying", async () => {
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(placePositionTpSl).toHaveBeenCalledTimes(2);
        const args = placePositionTpSl.mock.calls[0][0];
        expect(args.symbol).toBe("BTCUSDT");
        expect(args.positionId).toBe("pos-1");
        expect(args.stopLoss.price.eq(49500)).toBe(true);
        // The stop never shows up, so the honest outcome is unchanged.
        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
    });

    it("still attaches when the stop lands only after a retry wait", async () => {
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];
        plans.onLook = (n) => {
            if (n >= 2) {
                plans.value = { loss: { triggerPrice: "49500" }, profit: { triggerPrice: "51000" } };
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        // One re-place went out before the attached stop was seen.
        expect(placePositionTpSl).toHaveBeenCalledTimes(1);
        expect(result.stopLoss).toBe("attached");
        expect(result.unprotected).toBe(false);
        expect(result.errorKey).toBeUndefined();
    });

    it("does not invent a placement when the position id is unknown", async () => {
        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(placePositionTpSl).not.toHaveBeenCalled();
        expect(account.requestSync).toHaveBeenCalled();
        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
    });

    it("keeps the success path free of re-placement", async () => {
        plans.value = { loss: { triggerPrice: "49500" }, profit: { triggerPrice: "51000" } };

        await orderPlacementService.placeEntryGroup(plan());

        expect(placePositionTpSl).not.toHaveBeenCalled();
    });

    it("never claims the integration is missing", async () => {
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];

        await orderPlacementService.placeEntryGroup(plan());

        expect(loggerError).not.toHaveBeenCalledWith(
            "market",
            expect.stringContaining("not integrated"),
        );
    });
});

/*
 * BUG-0503 — a venue with no standalone stop path retries nothing.
 *
 * (What the trader sees — the entry refused before it is sent — is a gate
 * verdict and lives in `orderGate.capabilities.test.ts` and
 * `orderPlacementService.gateIntegration.test.ts`. `tradeService` is mocked here, so the gate never runs; what
 * this pins is the placement side: once the entry exists unprotected on such
 * a venue, the confirmation returns the honest outcome immediately instead
 * of spending the retry budget around a no-op.)
 */
describe("BUG-0503 — exchanges with no standalone stop path", () => {
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

    it("never attempts a standalone re-place where none exists", async () => {
        plans.value = {};
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];

        await orderPlacementService.placeEntryGroup(plan({ exchange: "bitget" }));

        // `replaceStop` reads `tpSlStandalone`, not `tpSlAtEntry` — on Bitget
        // there is no second request to make, so none is made.
        expect(placePositionTpSl).not.toHaveBeenCalled();
    });

    it("spends no retry delay where no retry is possible", async () => {
        // The whole point: an unprotected position must be reported, not
        // waited on. If the implementation slept around the no-op again,
        // this `await` would never resolve under the fake clock.
        vi.useFakeTimers();
        try {
            plans.value = {};
            const result = await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget" }),
            );
            expect(result.unprotected).toBe(true);
            expect(result.stopLoss).toBe("failed");
            // One look, no revisits: the retry loop returned on its first pass.
            expect(plans.looks).toBe(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("still retries where a standalone path exists", async () => {
        plans.value = {};
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];

        await orderPlacementService.placeEntryGroup(plan());

        // Bitunix declares both halves, so the retry path is unchanged.
        expect(placePositionTpSl).toHaveBeenCalled();
    });

    it("retries the standalone stop where attachment is absent", async () => {
        /*
         * The flags diverge only in this test: attachment absent, standalone
         * present — a combination no venue declares today. Under the old
         * `tpSlAtEntry` read `replaceStop` returned early here and the retry
         * window burned two sleeps around a no-op; under `tpSlStandalone`
         * the standalone placement is attempted. Fails on the old read,
         * passes on the new one.
         */
        capsDouble.mock!.mockReturnValue({
            orderTypes: ["market", "limit"],
            tpSlAtEntry: false,
            tpSlStandalone: true,
            timeInForce: [],
            multipleTakeProfits: false,
            marginModes: [],
            positionModes: [],
            trailingStop: false,
            addToPosition: true,
        });
        plans.value = {};
        account.positions = [{ positionId: "pos-1", symbol: "BTCUSDT", side: "long" }];

        const result = await orderPlacementService.placeEntryGroup(
            plan({ exchange: "bitget" }),
        );

        // Nothing rides along, but the standalone path is attempted twice
        // across the retry window — and the honest outcome is unchanged.
        expect(placeOrder.mock.calls[0][0].stopLoss).toBeUndefined();
        expect(placePositionTpSl).toHaveBeenCalledTimes(2);
        expect(placePositionTpSl.mock.calls[0][0]).toMatchObject({
            symbol: "BTCUSDT",
            positionId: "pos-1",
        });
        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
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

/*
 * FEAT-0017 — which time-in-force may be dropped, and which may not.
 *
 * The distinction is the whole point: dropping a value that changes how an
 * order executes, without telling anyone, hands the trader a different order
 * than the one they asked for. Dropping the neutral default hands them the
 * same order with one fewer field.
 */
describe("FEAT-0017 — time in force against venue capabilities", () => {
    function effectOf(): unknown {
        return placeOrder.mock.calls[0]?.[0]?.effect;
    }

    it("sends a time in force the venue declares", async () => {
        await orderPlacementService.placeEntryGroup(
            plan({ entryType: "limit", timeInForce: "POST_ONLY" }),
        );
        expect(effectOf()).toBe("POST_ONLY");
    });

    /*
     * Bitget declares an empty list. GTC is what an order does anyway with no
     * constraint attached, and the panel rests there, so dropping it changes
     * nothing — without this, a default nobody chose would have the gate
     * refuse every Bitget limit order.
     */
    it("drops GTC on a venue that declares none, since GTC changes nothing", async () => {
        await orderPlacementService.placeEntryGroup(
            plan({ exchange: "bitget", entryType: "limit", timeInForce: "GTC" }),
        );
        expect(effectOf()).toBeUndefined();
    });

    /*
     * The regression guard for the silent downgrade. POST_ONLY means "maker
     * only"; sending nothing instead means "fill however you can", which can
     * take the other side of the book at a taker fee. That is not a downgrade
     * to make quietly, so it travels and the gate refuses it out loud.
     */
    it.each(["IOC", "FOK", "POST_ONLY"] as const)(
        "does not silently drop %s on a venue that declares none",
        async (tif) => {
            await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget", entryType: "limit", timeInForce: tif }),
            );
            expect(effectOf()).toBe(tif);
        },
    );

    it("sends no time in force on a market order, whatever was selected", async () => {
        await orderPlacementService.placeEntryGroup(
            plan({ entryType: "market", timeInForce: "IOC" }),
        );
        expect(effectOf()).toBeUndefined();
    });
});

/*
 * BUG-0502 — the post-placement check must prove causation, not coincidence.
 * A plan that was already on the symbol, sits at the wrong price, or belongs
 * to the opposite side must never report the new position as protected.
 */
describe("BUG-0502 — protection check matches the new stop, not any stop", () => {
    it("reports unprotected when only a pre-existing stop is on the symbol", async () => {
        // The old plan is there before the entry and never changes: the new
        // stop was not accepted. Same object on every read, so it is also in
        // the before-image — identity alone must exclude it.
        plans.value = {
            loss: { orderId: "old-stop-1", triggerPrice: "49000" },
            profit: { orderId: "old-tp-1", triggerPrice: "51000" },
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.entryPlaced).toBe(true);
        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
        expect(result.errorKey).toBe("orderEntry.errors.unprotected");
    });

    it("does not settle on a stop at the wrong price", async () => {
        // No order id here on purpose: identity cannot exclude this one, so
        // only the price comparison stands between it and a false "attached".
        plans.value = {
            loss: { triggerPrice: "49000" },
            profit: { triggerPrice: "51000" },
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
    });

    it("does not settle on a stop belonging to the opposite side", async () => {
        // Long entry (BUY). The stop on the symbol protects a short (SELL).
        plans.value = {
            loss: { triggerPrice: "49500", side: "SELL" },
            profit: { triggerPrice: "51000", side: "SELL" },
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
    });

    it("still attaches when the stop matches price and side", async () => {
        // Nothing on the symbol before the entry; the venue publishes the
        // new plans afterwards. The before-image is empty, so identity lets
        // them through and price plus side confirm them.
        plans.value = {};
        plans.onLook = (n) => {
            if (n >= 1) {
                plans.value = {
                    loss: { orderId: "new-stop-9", triggerPrice: "49500", side: "BUY" },
                    profit: { orderId: "new-tp-9", triggerPrice: "51000", side: "BUY" },
                };
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result).toMatchObject({
            entryPlaced: true,
            stopLoss: "attached",
            takeProfit: "attached",
            unprotected: false,
        });
    });

    it("applies the same causation to the take-profit half", async () => {
        plans.value = {
            loss: { triggerPrice: "49500" },
            profit: { triggerPrice: "52000" },
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        // A missing target costs upside, not capital — loud, but not
        // "unprotected".
        expect(result.takeProfit).toBe("failed");
        expect(result.stopLoss).toBe("attached");
        expect(result.unprotected).toBe(false);
        expect(result.errorKey).toBe("orderEntry.errors.targetMissing");
    });
});

/*
 * BUG-0524 — a plan from another position must not settle this entry's
 * check. In hedge mode both sides hold stops on the same symbol; price
 * plus side cannot tell them apart (production plans carry no side), so
 * the entry's position id decides.
 */
describe("BUG-0524 — protection check matches the entry's position", () => {
    beforeEach(() => {
        account.positions = [{ positionId: "pos-new", symbol: "BTCUSDT", side: "long" }];
    });

    it("does not settle on a same-price stop from another position", async () => {
        // Correct price, fresh id, but protecting the old (or opposite-side)
        // position — the classic hedge false-positive. Published after the
        // entry, so identity cannot exclude it: only position scoping can.
        plans.value = {};
        plans.onLook = (n) => {
            if (n >= 1) {
                plans.value = {
                    loss: { orderId: "other-stop-1", triggerPrice: "49500", positionId: "pos-old" },
                    profit: { orderId: "new-tp-1", triggerPrice: "51000", positionId: "pos-new" },
                };
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.stopLoss).toBe("failed");
        expect(result.unprotected).toBe(true);
    });

    it("confirms the stop sitting on the entry's own position", async () => {
        plans.value = {};
        plans.onLook = (n) => {
            if (n >= 1) {
                plans.value = {
                    loss: { orderId: "new-stop-9", triggerPrice: "49500", positionId: "pos-new" },
                    profit: { orderId: "new-tp-9", triggerPrice: "51000", positionId: "pos-new" },
                };
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result).toMatchObject({
            entryPlaced: true,
            stopLoss: "attached",
            takeProfit: "attached",
            unprotected: false,
        });
    });

    it("falls back to price plus identity when no position id is known", async () => {
        // Neither the plans nor the account state name a position: venues
        // (or rows) without ids must read exactly as before, never as
        // "unprotected". Id-less on purpose, so identity cannot exclude and
        // the fallback is what confirms.
        account.positions = [];
        plans.value = {
            loss: { triggerPrice: "49500" },
            profit: { triggerPrice: "51000" },
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result).toMatchObject({ stopLoss: "attached", unprotected: false });
    });

    it("looks past the first plan when hedge holds stops on both sides", async () => {
        // `plansFor` answers first-pick per leg; the confirmation must see
        // the whole list. The first loss plan belongs elsewhere at the wrong
        // price, the second is this entry's — a first-pick reader never
        // finds it.
        plans.value = {
            loss: { orderId: "other-stop-1", triggerPrice: "49000", positionId: "pos-old" },
        };
        plans.onLook = (n) => {
            if (n >= 1) {
                plans.extra = [
                    {
                        orderId: "new-stop-9",
                        triggerPrice: "49500",
                        positionId: "pos-new",
                        planType: "LOSS",
                    },
                ];
            }
        };

        const result = await orderPlacementService.placeEntryGroup(plan());

        expect(result.stopLoss).toBe("attached");
        expect(result.unprotected).toBe(false);
    });
});
