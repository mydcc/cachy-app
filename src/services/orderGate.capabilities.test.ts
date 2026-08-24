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
 * FEAT-0017 at the gate — the half of the feature the UI cannot vouch for.
 *
 * Every intent below is one the UI would never build if it read capabilities
 * correctly. That is exactly the point of testing them: the acceptance
 * criterion is that the gate refuses an unsupported combination *independently
 * of the UI*, so each case here simulates a UI that got it wrong.
 *
 * Kept out of `orderGate.test.ts` because these intents are deliberately
 * malformed against a venue, while that file's fixtures are well-formed.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { orderGate, type OrderIntent } from "./orderGate";

const FINGERPRINT = "abcd…wxyz";

/**
 * A well-formed opening order, parameterised by venue. Bitunix accepts this
 * shape wholesale; Bitget is where the capability differences bite.
 *
 * `displayed.stopLossPrice` deliberately tracks whether the payload actually
 * carries a stop. The gate's price rule refuses a displayed level the payload
 * omits — a different rule from the one under test here, and one these
 * fixtures must not trip on their way to it. That the *production* caller
 * lets those two diverge on a no-attach venue is
 * BUG-0297, not something to encode in a capability fixture.
 */
function openIntent(provider: string, overrides: Record<string, unknown> = {}): OrderIntent {
    const payload: Record<string, unknown> = {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "LIMIT",
        qty: "0.02",
        price: "50000",
        leverage: "10",
        marginMode: "ISOLATED",
        ...overrides,
    };
    const slPrice = payload.slPrice;
    const tpPrice = payload.tpPrice;
    return {
        kind: "open",
        endpoint: "/api/orders",
        payload,
        displayed: {
            provider,
            accountFingerprint: FINGERPRINT,
            symbol: "BTCUSDT",
            side: "BUY",
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: typeof slPrice === "string" ? new Decimal(slPrice) : undefined,
            takeProfits: typeof tpPrice === "string" ? [new Decimal(tpPrice)] : undefined,
            leverage: new Decimal(10),
            marginMode: "ISOLATED",
            stepSize: new Decimal("0.0001"),
            accountStateAt: Date.now(),
        },
    };
}

/** A market close — the one entry-free order shape every venue takes. */
function reduceIntent(provider: string, overrides: Record<string, unknown> = {}): OrderIntent {
    return {
        kind: "reduce",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "SELL",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: true,
            tradeSide: "CLOSE",
            ...overrides,
        },
        displayed: {
            provider,
            accountFingerprint: FINGERPRINT,
            symbol: "BTCUSDT",
            side: "SELL",
            positionAmount: new Decimal("0.5"),
            fullClose: true,
        },
    };
}

/** The whole shape a Bitunix entry uses: protection rides along. */
function attachedIntent(overrides: Record<string, unknown> = {}): OrderIntent {
    return openIntent("bitunix", { slPrice: "49500", tpPrice: "51000", ...overrides });
}

describe("orderGate × exchange capabilities (FEAT-0017)", () => {
    describe("baseline — the gate does not refuse what a venue declares", () => {
        it("approves a Bitunix entry with attached protection", () => {
            expect(orderGate.verify(attachedIntent()).approved).toBe(true);
        });

        /*
         * Bitget's realistic entry path cannot be expressed as an approved
         * `open` intent at all today: the size rule needs `displayed
         * .stopLossPrice`, the price rule then demands a matching `slPrice` in
         * the payload, and `tpSlAtEntry: false` forbids sending one. That
         * deadlock is BUG-0297 and predates this item — a reduce is the
         * Bitget path that does work, and it is what this pins.
         */
        it("approves a Bitget market close", () => {
            expect(orderGate.verify(reduceIntent("bitget")).approved).toBe(true);
        });

        it("refuses a Bitget entry for a reason that is not the capability check", () => {
            const verdict = orderGate.verify(openIntent("bitget"));
            expect(verdict.approved).toBe(false);
            // BUG-0297 territory, not FEAT-0017's: whatever refuses this, it
            // must not be a capability the venue actually declares.
            expect(verdict.refusal?.field).not.toBe("orderType");
            expect(verdict.refusal?.field).not.toBe("effect");
            expect(verdict.refusal?.field).not.toBe("tpSlAtEntry");
        });
    });

    describe("order type", () => {
        it("does not crash on an order type it cannot read", () => {
            // An unreadable type is deliberately not checked against
            // capabilities: the mismatch and missing rules already cover a
            // payload disagreeing with the display, and inventing a type to
            // refuse would refuse valid orders.
            const verdict = orderGate.verify(attachedIntent({ orderType: "STOP" }));
            expect(verdict).toBeDefined();
            expect(verdict.refusal?.field).not.toBe("orderType");
        });

        it("refuses every order type on an undeclared venue", () => {
            const verdict = orderGate.verify(openIntent("kraken"));
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.reason).toBe("unsupported");
            expect(verdict.refusal?.field).toBe("orderType");
            expect(verdict.refusal?.messageKey).toBe("orderGate.unsupportedOrderType");
        });

        it("names the venue in the refusal, so the message can say which", () => {
            const verdict = orderGate.verify(openIntent("kraken"));
            expect(verdict.refusal?.values.exchange).toBe("kraken");
            expect(verdict.refusal?.values.orderType).toBe("limit");
        });

        it("records the check in the audit trail even when it passes", () => {
            const verdict = orderGate.verify(openIntent("bitunix"));
            expect(verdict.checked).toContain("orderTypeSupported");
        });
    });

    describe("time in force", () => {
        it("refuses a time in force on a venue that declares none", () => {
            const verdict = orderGate.verify(openIntent("bitget", { effect: "GTC" }));
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.reason).toBe("unsupported");
            expect(verdict.refusal?.field).toBe("effect");
            expect(verdict.refusal?.messageKey).toBe("orderGate.unsupportedTimeInForce");
            expect(verdict.refusal?.values.timeInForce).toBe("GTC");
        });

        it("accepts each value Bitunix declares", () => {
            for (const effect of ["GTC", "IOC", "FOK", "POST_ONLY"]) {
                expect(orderGate.verify(attachedIntent({ effect })).approved).toBe(true);
            }
        });

        it("refuses a value no venue declares", () => {
            const verdict = orderGate.verify(attachedIntent({ effect: "DAY" }));
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.field).toBe("effect");
        });

        /*
         * Absence must not be refused. A venue accepting no time-in-force
         * still has to accept orders, so checking on absence would close it.
         */
        it("does not check a time in force that was never sent", () => {
            const verdict = orderGate.verify(reduceIntent("bitget"));
            expect(verdict.approved).toBe(true);
            expect(verdict.checked).not.toContain("timeInForceSupported");
        });
    });

    describe("protection attached to the entry", () => {
        it("refuses attached TP/SL on a venue that cannot carry it", () => {
            const verdict = orderGate.verify(
                openIntent("bitget", { slPrice: "49500", tpPrice: "51000" }),
            );
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.reason).toBe("unsupported");
            expect(verdict.refusal?.field).toBe("tpSlAtEntry");
            expect(verdict.refusal?.messageKey).toBe("orderGate.unsupportedTpSlAtEntry");
        });

        it("refuses a lone attached stop too, not just the pair", () => {
            const verdict = orderGate.verify(openIntent("bitget", { slPrice: "49500" }));
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.field).toBe("tpSlAtEntry");
        });

        it("does not check attachment when nothing is attached", () => {
            const verdict = orderGate.verify(reduceIntent("bitget"));
            expect(verdict.approved).toBe(true);
            expect(verdict.checked).not.toContain("tpSlAtEntrySupported");
        });
    });

    describe("multiple take profits", () => {
        it("refuses a ladder on a venue carrying only one target", () => {
            const intent = attachedIntent();
            intent.displayed.takeProfits = [
                new Decimal(51000),
                new Decimal(52000),
                new Decimal(53000),
            ];
            const verdict = orderGate.verify(intent);
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.field).toBe("takeProfits");
            expect(verdict.refusal?.messageKey).toBe("orderGate.unsupportedMultipleTakeProfits");
            expect(verdict.refusal?.values.count).toBe("3");
        });

        it("allows a single target", () => {
            expect(orderGate.verify(attachedIntent()).approved).toBe(true);
        });
    });

    describe("scope", () => {
        /*
         * The standalone TP/SL endpoints put their levels under `params.` and
         * are governed by `TradingSupport`, not by whether protection may ride
         * along with an entry. Refusing them here would break FEAT-0070.
         */
        it("leaves a standalone TP/SL payload alone", () => {
            const intent: OrderIntent = {
                kind: "modify",
                endpoint: "/api/tpsl",
                payload: {
                    type: "tpsl-modify",
                    symbol: "BTCUSDT",
                    params: { tpPrice: "51000" },
                },
                displayed: {
                    provider: "bitget",
                    accountFingerprint: FINGERPRINT,
                    symbol: "BTCUSDT",
                },
                priceFields: { takeProfit: "params.tpPrice" },
            };
            const verdict = orderGate.verify(intent);
            expect(verdict.checked).not.toContain("tpSlAtEntrySupported");
            expect(verdict.checked).not.toContain("orderTypeSupported");
        });

        it("still checks a reduce-only market close, which every venue takes", () => {
            const intent: OrderIntent = {
                kind: "reduce",
                endpoint: "/api/orders",
                payload: {
                    type: "place-order",
                    symbol: "BTCUSDT",
                    side: "SELL",
                    orderType: "MARKET",
                    qty: "0.5",
                    reduceOnly: true,
                    tradeSide: "CLOSE",
                },
                displayed: {
                    provider: "bitget",
                    accountFingerprint: FINGERPRINT,
                    symbol: "BTCUSDT",
                    side: "SELL",
                    positionAmount: new Decimal("0.5"),
                    fullClose: true,
                },
            };
            const verdict = orderGate.verify(intent);
            expect(verdict.checked).toContain("orderTypeSupported");
            expect(verdict.approved).toBe(true);
        });
    });
});
