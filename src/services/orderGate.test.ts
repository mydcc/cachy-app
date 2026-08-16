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
 * FEAT-0011 — acceptance criteria for the order gate.
 *
 * The shape of nearly every test here is the same: build an intent the gate
 * approves, then mutate exactly one field of the payload after construction
 * and assert the gate refuses and names that field. A check that only ever
 * sees consistent input proves nothing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import {
    orderGate,
    assertGatePass,
    accountFingerprint,
    registerKillSwitch,
    registerRiskLimitCheck,
    translateRefusal,
    OrderRefusedError,
    MAX_ACCOUNT_STATE_AGE_MS,
    mutatingActionOf,
    type OrderIntent,
    type GatePass,
} from "./orderGate";

const ACCOUNT = {
    provider: "bitunix",
    accountFingerprint: "abcd…wxyz",
};

/**
 * A well-formed opening order: 1000 USDT account, 1 % risk, 500 stop
 * distance → 10 risk / 500 = 0.02 BTC.
 */
function openIntent(): OrderIntent {
    return {
        kind: "open",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
            price: "50000",
            slPrice: "49500",
            tpPrice: "51000",
            leverage: "10",
            marginMode: "ISOLATED",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
            takeProfits: [new Decimal(51000)],
            leverage: new Decimal(10),
            marginMode: "ISOLATED",
            stepSize: new Decimal("0.0001"),
            accountStateAt: Date.now(),
        },
    };
}

function reduceIntent(): OrderIntent {
    return {
        kind: "reduce",
        endpoint: "/api/orders",
        payload: {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: true,
            tradeSide: "CLOSE",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            positionAmount: new Decimal("0.5"),
            fullClose: true,
            positionId: "pos-1",
        },
    };
}

beforeEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

describe("orderGate — baseline", () => {
    it("approves a consistent opening order", () => {
        const verdict = orderGate.verify(openIntent());
        expect(verdict.refusal).toBeNull();
        expect(verdict.approved).toBe(true);
    });

    it("approves a consistent full close", () => {
        expect(orderGate.verify(reduceIntent()).approved).toBe(true);
    });

    it("records every field it compared", () => {
        const verdict = orderGate.verify(openIntent());
        expect(verdict.checked).toEqual(
            expect.arrayContaining([
                "killSwitch",
                "account",
                "symbol",
                "side",
                "qty",
                "price",
                "stopLoss",
                "takeProfit",
                "leverage",
                "marginMode",
                "riskLimits",
            ]),
        );
    });
});

// AC: "Each checked field has a test that mutates it after construction and
// asserts refusal, with the field named in the error."
describe("orderGate — per-field mutation after construction", () => {
    const cases: Array<{
        field: string;
        mutate: (intent: OrderIntent) => void;
        base?: () => OrderIntent;
    }> = [
            {
                field: "symbol",
                mutate: (i) => {
                    i.payload.symbol = "ETHUSDT";
                },
            },
            {
                field: "side",
                mutate: (i) => {
                    i.payload.side = "SELL";
                },
            },
            {
                field: "qty",
                mutate: (i) => {
                    i.payload.qty = "0.2"; // 10x the correct size
                },
            },
            {
                field: "price",
                mutate: (i) => {
                    i.payload.price = "50001";
                },
            },
            {
                field: "stopLoss",
                mutate: (i) => {
                    i.payload.slPrice = "49000";
                },
            },
            {
                field: "takeProfit[0]",
                mutate: (i) => {
                    i.payload.tpPrice = "52000";
                },
            },
            {
                field: "leverage",
                mutate: (i) => {
                    i.payload.leverage = "20";
                },
            },
            {
                field: "marginMode",
                mutate: (i) => {
                    i.payload.marginMode = "CROSS";
                },
            },
            {
                field: "accountState",
                mutate: (i) => {
                    i.displayed.accountStateAt = Date.now() - MAX_ACCOUNT_STATE_AGE_MS - 1;
                },
            },
            {
                field: "positionId",
                base: reduceIntent,
                mutate: (i) => {
                    i.payload.positionId = "pos-2";
                },
            },
            {
                field: "reduceOnly",
                base: reduceIntent,
                mutate: (i) => {
                    i.payload.reduceOnly = false;
                    i.payload.tradeSide = "OPEN";
                },
            },
            {
                field: "orderId",
                base: () => ({
                    kind: "cancel",
                    endpoint: "/api/orders",
                    payload: { type: "cancel-order", symbol: "BTCUSDT", orderId: "o-1" },
                    displayed: { ...ACCOUNT, symbol: "BTCUSDT", orderId: "o-1" },
                }),
                mutate: (i) => {
                    i.payload.orderId = "o-2";
                },
            },
        ];

    for (const { field, mutate, base } of cases) {
        it(`refuses a mutated ${field} and names it`, () => {
            const intent = (base ?? openIntent)();
            expect(orderGate.verify(intent).approved).toBe(true);

            mutate(intent);

            const verdict = orderGate.verify(intent);
            expect(verdict.approved).toBe(false);
            expect(verdict.refusal?.field).toBe(field);
            // The refusal has to say by how much, not just that something was wrong.
            expect(verdict.refusal?.values.field).toBe(field);
        });
    }

    it("names both the expected and the actual value", () => {
        const intent = openIntent();
        intent.payload.price = "50001";
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.values.expected).toBe("50000");
        expect(refusal?.values.actual).toBe("50001");
    });

    it("reports the tolerance alongside a size mismatch", () => {
        const intent = openIntent();
        intent.payload.qty = "0.2";
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.reason).toBe("sizeMismatch");
        expect(refusal?.values.expected).toBe("0.02");
        expect(refusal?.values.actual).toBe("0.2");
        expect(new Decimal(refusal!.values.tolerance).lt("0.02")).toBe(true);
    });

    it("never repairs the payload it refused", () => {
        const intent = openIntent();
        intent.payload.qty = "0.2";
        orderGate.verify(intent);
        expect(intent.payload.qty).toBe("0.2");
    });
});

// AC: "Comparisons use Decimal; a test with values that differ only in float
// representation passes rather than falsely refusing."
describe("orderGate — Decimal comparison", () => {
    it("accepts values that differ only in representation", () => {
        const intent = openIntent();
        // Same numbers, written the way a serializer might emit them.
        intent.payload.price = "50000.00";
        intent.payload.slPrice = "4.95e4";
        intent.payload.tpPrice = "51000.000000";
        intent.payload.qty = "0.0200";

        const verdict = orderGate.verify(intent);
        expect(verdict.refusal).toBeNull();
        expect(verdict.approved).toBe(true);
    });

    it("accepts sub-1e-7 prices written without scientific notation", () => {
        const intent = openIntent();
        intent.displayed.entryPrice = new Decimal("1e-7");
        intent.displayed.stopLossPrice = new Decimal("0.9e-7");
        intent.displayed.takeProfits = [new Decimal("1.2e-7")];
        intent.displayed.accountSize = new Decimal(1000);
        intent.displayed.riskPercentage = new Decimal(1);

        const riskPerUnit = new Decimal("1e-7").minus("0.9e-7").abs();
        const expectedQty = new Decimal(1000).times("0.01").div(riskPerUnit);

        intent.payload.price = "0.0000001";
        intent.payload.slPrice = "0.00000009";
        intent.payload.tpPrice = "0.00000012";
        intent.payload.qty = expectedQty.toFixed(expectedQty.decimalPlaces());

        expect(orderGate.verify(intent).refusal).toBeNull();
    });

    it("would have refused these values under a string comparison", () => {
        // Guards the test above from decaying into a tautology: the strings
        // really are different, it is only the Decimal comparison that makes
        // them equal.
        expect("50000.00").not.toBe("50000");
        expect("4.95e4").not.toBe("49500");
    });
});

describe("orderGate — size tolerance", () => {
    it("tolerates rounding to the instrument's step size", () => {
        const intent = openIntent();
        intent.displayed.stepSize = new Decimal("0.001");
        intent.payload.qty = "0.021"; // one step above the exact 0.02
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("refuses a 10x sizing error however coarse the step", () => {
        const intent = openIntent();
        intent.displayed.stepSize = new Decimal("0.001");
        intent.payload.qty = "0.2";
        expect(orderGate.verify(intent).refusal?.field).toBe("qty");
    });

    it("falls back to a relative floor when no step size is known", () => {
        const intent = openIntent();
        delete intent.displayed.stepSize;
        intent.payload.qty = "0.020019"; // within 0.1 %
        expect(orderGate.verify(intent).approved).toBe(true);

        intent.payload.qty = "0.021"; // 5 % out
        expect(orderGate.verify(intent).refusal?.field).toBe("qty");
    });

    it("refuses an open whose size cannot be derived a second way", () => {
        const intent = openIntent();
        delete intent.displayed.accountSize;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("qty.inputs");
        expect(refusal?.reason).toBe("missing");
    });

    it("refuses a zero stop distance rather than dividing by it", () => {
        const intent = openIntent();
        intent.displayed.stopLossPrice = intent.displayed.entryPrice;
        intent.payload.slPrice = String(intent.displayed.entryPrice);
        expect(orderGate.verify(intent).refusal?.field).toBe("qty");
    });
});

describe("orderGate — reduce-only sizing", () => {
    it("refuses a close larger than the position", () => {
        const intent = reduceIntent();
        intent.payload.qty = "0.6";
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("qty");
        expect(refusal?.values.expected).toBe("<= 0.5");
    });

    it("allows a partial close below the position size", () => {
        const intent = reduceIntent();
        intent.displayed.fullClose = false;
        intent.payload.qty = "0.25";
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("refuses a partial qty when a full close was declared", () => {
        const intent = reduceIntent();
        intent.payload.qty = "0.25";
        expect(orderGate.verify(intent).refusal?.field).toBe("qty");
    });

    it("refuses a non-positive qty", () => {
        const intent = reduceIntent();
        intent.payload.qty = "0";
        expect(orderGate.verify(intent).refusal?.field).toBe("qty");
    });
});

describe("orderGate — account state freshness", () => {
    it("refuses an open when the account state has never been read", () => {
        const intent = openIntent();
        delete intent.displayed.accountStateAt;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("accountState");
        expect(refusal?.reason).toBe("stale");
    });

    it("does not gate a close on account-state freshness", () => {
        // Closing is exactly what a trader needs when the cached account read
        // has gone stale; refusing there would be the wrong failure mode.
        const intent = reduceIntent();
        intent.displayed.leverage = new Decimal(10);
        intent.displayed.accountStateAt = Date.now() - MAX_ACCOUNT_STATE_AGE_MS * 10;
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("does not gate a paper order on it either", () => {
        // Nothing stamps `accountStateAt` in paper mode — there is no exchange
        // read to stamp it — so applying the check refuses every simulated
        // order, which defeats the point of a practice mode.
        const intent = openIntent();
        intent.displayed.paperMode = true;
        delete intent.displayed.accountStateAt;
        expect(orderGate.verify(intent).approved).toBe(true);
    });

    it("still refuses a live order that has no account read", () => {
        // The paper exemption must not be reachable by omission: absent
        // paperMode means live, and live still needs a fresh read.
        const intent = openIntent();
        delete intent.displayed.accountStateAt;
        expect(orderGate.verify(intent).refusal?.field).toBe("accountState");
    });

    it("names the age and the limit, so the message can say them", () => {
        // The refusal text interpolates {field}, {age} and {max}. A caller that
        // renders `messageKey` without these values shows the trader the raw
        // placeholders — which is exactly what shipped once.
        const intent = openIntent();
        intent.displayed.accountStateAt = Date.now() - MAX_ACCOUNT_STATE_AGE_MS * 3;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.values.field).toBe("accountState");
        expect(Number(refusal?.values.age)).toBeGreaterThanOrEqual(
            Math.round((MAX_ACCOUNT_STATE_AGE_MS * 3) / 1000),
        );
        expect(refusal?.values.max).toBe(String(MAX_ACCOUNT_STATE_AGE_MS / 1000));
    });
});

describe("orderGate — rendering a refusal", () => {
    // A fake `$_`: substitutes {placeholders}, and echoes the key back when it
    // has no entry, the way svelte-i18n does.
    const MESSAGES: Record<string, string> = {
        "orderGate.stale":
            "Order refused: the account state ({field}) is {age}s old, older than the {max}s limit. Refresh it and try again.",
        "orderGate.fields.accountState": "account state",
    };
    const t = (key: string, options?: { values?: Record<string, string> }) => {
        const template = MESSAGES[key];
        if (template === undefined) return key;
        return template.replace(/\{(\w+)\}/g, (_m, name) => options?.values?.[name] ?? `{${name}}`);
    };

    it("fills in the field, the age and the limit", () => {
        const intent = openIntent();
        intent.displayed.accountStateAt = Date.now() - 120_000;
        const refusal = orderGate.verify(intent).refusal!;

        const text = translateRefusal(refusal, t);
        expect(text).toContain("account state");
        expect(text).toContain("120s old");
        expect(text).toContain("60s limit");
        // The bug this file is guarding against.
        expect(text).not.toContain("{");
    });

    it("falls back to the raw field name when it has no translation", () => {
        const refusal = {
            field: "takeProfit[0]",
            reason: "mismatch",
            messageKey: "orderGate.mismatch",
            values: { field: "takeProfit[0]" },
        };
        // svelte-i18n echoes an unknown key; the raw name beats showing the
        // trader a dotted key path.
        expect(translateRefusal(refusal, t)).not.toContain("orderGate.fields.");
    });
});

describe("orderGate — FEAT-0013 seam", () => {
    it("refuses when the kill switch is engaged", () => {
        registerKillSwitch(() => true);
        const verdict = orderGate.verify(openIntent());
        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("killSwitch");
    });

    it("checks the kill switch before anything else", () => {
        registerKillSwitch(() => true);
        const intent = openIntent();
        intent.payload.symbol = "ETHUSDT";
        // Even with another field wrong, the kill switch is the answer.
        expect(orderGate.verify(intent).refusal?.field).toBe("killSwitch");
    });

    it("passes the intent to a registered risk-limit check and honours its refusal", () => {
        const check = vi.fn(() => ({
            field: "riskLimit",
            reason: "riskLimit" as const,
            messageKey: "orderGate.riskLimit",
            values: { field: "riskLimit", detail: "daily loss cap" },
        }));
        registerRiskLimitCheck(check);

        const verdict = orderGate.verify(openIntent());
        expect(check).toHaveBeenCalledOnce();
        expect(verdict.refusal?.field).toBe("riskLimit");
    });

    it("approves when no limits are registered", () => {
        expect(orderGate.verify(openIntent()).approved).toBe(true);
    });
});

// AC: "A refusal produces no network call at all — asserted against a mocked
// transport." AC: "The gate runs with the network down."
describe("orderGate — submit", () => {
    it("never reaches the transport on refusal", async () => {
        const transport = vi.fn();
        const intent = openIntent();
        intent.payload.qty = "0.2";

        await expect(orderGate.submit(intent, transport)).rejects.toBeInstanceOf(
            OrderRefusedError,
        );
        expect(transport).not.toHaveBeenCalled();
    });

    it("carries the refusal detail on the thrown error", async () => {
        const intent = openIntent();
        intent.payload.symbol = "ETHUSDT";
        await expect(orderGate.submit(intent, vi.fn())).rejects.toMatchObject({
            name: "OrderRefusedError",
            refusal: { field: "symbol", values: { expected: "BTCUSDT", actual: "ETHUSDT" } },
        });
    });

    it("verifies with the network down", async () => {
        const globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(
            new Error("ENETDOWN"),
        );
        try {
            const bad = openIntent();
            bad.payload.side = "SELL";
            expect(orderGate.verify(bad).refusal?.field).toBe("side");
            expect(orderGate.verify(openIntent()).approved).toBe(true);
            expect(globalFetch).not.toHaveBeenCalled();
        } finally {
            globalFetch.mockRestore();
        }
    });

    it("hands the transport a pass the transport accepts", async () => {
        const intent = openIntent();
        const result = await orderGate.submit(intent, async (pass) => {
            assertGatePass(
                {
                    endpoint: intent.endpoint,
                    payload: intent.payload,
                    provider: ACCOUNT.provider,
                    accountFingerprint: ACCOUNT.accountFingerprint,
                    paperMode: false,
                },
                pass,
            );
            return "sent";
        });
        expect(result).toBe("sent");
    });
});

// AC: "Every order-placing path in the codebase reaches the exchange only
// through the gate — proven by a test that adds a call site bypassing it and
// fails."
describe("orderGate — the transport is unreachable without a pass", () => {
    const ctx = (payload: Record<string, unknown>) => ({
        endpoint: "/api/orders",
        payload,
        provider: ACCOUNT.provider,
        accountFingerprint: ACCOUNT.accountFingerprint,
        paperMode: false,
    });

    it("rejects a mutating request with no pass at all", () => {
        // This is the bypassing call site: it constructs a payload and heads
        // straight for the transport.
        expect(() =>
            assertGatePass(ctx({ type: "place-order", symbol: "BTCUSDT", qty: "1" })),
        ).toThrow(OrderRefusedError);
    });

    it.each([
        "place-order",
        "close-position",
        "close-all-positions",
        "flash-close-position",
        "cancel-order",
        "cancel-all",
        "modify-order",
    ])("rejects %s without a pass", (type) => {
        expect(() => assertGatePass(ctx({ type, symbol: "BTCUSDT" }))).toThrow(
            OrderRefusedError,
        );
    });

    it("rejects a forged pass", () => {
        const forged = {} as GatePass;
        expect(() =>
            assertGatePass(ctx({ type: "cancel-all" }), forged),
        ).toThrow(OrderRefusedError);
    });

    it("lets read-only requests through untouched", () => {
        expect(() => assertGatePass(ctx({ type: "history" }))).not.toThrow();
        expect(() => assertGatePass(ctx({ type: "pending" }))).not.toThrow();
        expect(() => assertGatePass(ctx({ type: "order-detail" }))).not.toThrow();
    });

    it("refuses to reuse a pass", async () => {
        const intent = reduceIntent();
        let captured: GatePass | null = null;
        await orderGate.submit(intent, async (pass) => {
            captured = pass;
            assertGatePass(ctx(intent.payload), pass);
        });
        expect(() => assertGatePass(ctx(intent.payload), captured!)).toThrow(
            OrderRefusedError,
        );
    });

    it("refuses a pass replayed against a different action", async () => {
        const intent = reduceIntent();
        await expect(
            orderGate.submit(intent, async (pass) =>
                assertGatePass(ctx({ ...intent.payload, type: "cancel-all" }), pass),
            ),
        ).rejects.toMatchObject({ refusal: { field: "action" } });
    });

    it("refuses a pass replayed against a different symbol", async () => {
        const intent = reduceIntent();
        await expect(
            orderGate.submit(intent, async (pass) =>
                assertGatePass(ctx({ ...intent.payload, symbol: "ETHUSDT" }), pass),
            ),
        ).rejects.toMatchObject({ refusal: { field: "symbol" } });
    });

    it("refuses when the account changed between approval and transmission", async () => {
        const intent = reduceIntent();
        await expect(
            orderGate.submit(intent, async (pass) =>
                assertGatePass(
                    { ...ctx(intent.payload), provider: "bitget" },
                    pass,
                ),
            ),
        ).rejects.toMatchObject({ refusal: { field: "account" } });
    });

    it("refuses when the API key changed between approval and transmission", async () => {
        const intent = reduceIntent();
        await expect(
            orderGate.submit(intent, async (pass) =>
                assertGatePass(
                    { ...ctx(intent.payload), accountFingerprint: "othe…rkey" },
                    pass,
                ),
            ),
        ).rejects.toMatchObject({ refusal: { field: "account" } });
    });

    it("refuses when paper mode changed between approval and transmission", async () => {
        // FEAT-0012. The dangerous direction is believing you are simulating
        // while live, so a mode that moved under the order stops it.
        const intent = reduceIntent();
        await expect(
            orderGate.submit(intent, async (pass) =>
                assertGatePass({ ...ctx(intent.payload), paperMode: true }, pass),
            ),
        ).rejects.toMatchObject({
            refusal: { field: "mode", values: { expected: "live", actual: "paper" } },
        });
    });

    it("classifies every mutating action and no read-only one", () => {
        expect(mutatingActionOf({ type: "place-order" })).toBe("place-order");
        expect(mutatingActionOf({ action: "cancel" })).toBe("cancel");
        expect(mutatingActionOf({ type: "history" })).toBeNull();
        expect(mutatingActionOf({})).toBeNull();
    });
});

describe("orderGate — symbol", () => {
    it("refuses a symbol the payload names but the UI never showed", () => {
        const intent = reduceIntent();
        delete intent.displayed.symbol;
        const refusal = orderGate.verify(intent).refusal;
        expect(refusal?.field).toBe("symbol");
        expect(refusal?.reason).toBe("missing");
    });

    it("compares the symbol on an account-wide bulk action that names one", () => {
        const bulk: OrderIntent = {
            kind: "bulk",
            endpoint: "/api/orders",
            payload: { type: "cancel-all", symbol: "BTCUSDT" },
            displayed: { ...ACCOUNT, symbol: "BTCUSDT" },
        };
        expect(orderGate.verify(bulk).approved).toBe(true);

        bulk.payload.symbol = "ETHUSDT";
        expect(orderGate.verify(bulk).refusal?.field).toBe("symbol");
    });

    it("has nothing to compare on an account-wide bulk action with no symbol", () => {
        expect(
            orderGate.verify({
                kind: "bulk",
                endpoint: "/api/orders",
                payload: { type: "cancel-all", symbol: undefined },
                displayed: { ...ACCOUNT },
            }).approved,
        ).toBe(true);
    });

    it("requires a symbol on anything that moves a position", () => {
        const intent = reduceIntent();
        delete intent.payload.symbol;
        delete intent.displayed.symbol;
        expect(orderGate.verify(intent).refusal?.field).toBe("symbol");
    });
});

describe("orderGate — identifiers that arrive as Decimals", () => {
    it("compares an order ID that reached the payload as a Decimal", () => {
        const intent: OrderIntent = {
            kind: "cancel",
            endpoint: "/api/tpsl",
            payload: {
                action: "cancel",
                symbol: "BTCUSDT",
                orderId: new Decimal("1234567890123456789.123"),
            },
            displayed: {
                ...ACCOUNT,
                symbol: "BTCUSDT",
                orderId: "1234567890123456789.123",
            },
        };
        expect(orderGate.verify(intent).approved).toBe(true);

        intent.payload.orderId = new Decimal("1234567890123456789.124");
        expect(orderGate.verify(intent).refusal?.field).toBe("orderId");
    });
});

describe("orderGate — prototype pollution", () => {
    it("does not resolve a price inherited from Object.prototype", () => {
        const polluted = Object.create({ price: "50000" }) as Record<string, unknown>;
        Object.assign(polluted, {
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            qty: "0.02",
            slPrice: "49500",
            tpPrice: "51000",
            leverage: "10",
            marginMode: "ISOLATED",
        });
        const intent = openIntent();
        intent.payload = polluted;
        // The inherited `price` must not answer for a price the order never set.
        expect(orderGate.verify(intent).refusal?.field).toBe("price");
    });
});

// AC: "Refusal messages exist in German and English."
describe("orderGate — refusal messages", () => {
    it("translates the field name into the message", () => {
        const refusal = orderGate.verify({
            ...openIntent(),
            payload: { ...openIntent().payload, symbol: "ETHUSDT" },
        }).refusal!;

        const t = (key: string, options?: { values?: Record<string, string> }) => {
            if (key === "orderGate.fields.symbol") return "das Symbol";
            if (key === "orderGate.mismatch") {
                return `Order abgelehnt: ${options?.values?.field} (${options?.values?.expected} / ${options?.values?.actual})`;
            }
            return key;
        };

        expect(translateRefusal(refusal, t)).toBe(
            "Order abgelehnt: das Symbol (BTCUSDT / ETHUSDT)",
        );
    });

    it("falls back to the raw field name when no translation exists", () => {
        const intent = openIntent();
        intent.payload.tpPrice = "52000";
        const refusal = orderGate.verify(intent).refusal!;
        // svelte-i18n echoes an unknown key back.
        const echo = (key: string, options?: { values?: Record<string, string> }) =>
            key === "orderGate.mismatch" ? `field=${options?.values?.field}` : key;
        expect(translateRefusal(refusal, echo)).toBe("field=takeProfit[0]");
    });
});

describe("accountFingerprint", () => {
    it("never returns the key itself", () => {
        const key = "AKIAEXAMPLEKEY123456";
        const fingerprint = accountFingerprint(key);
        expect(fingerprint).not.toBe(key);
        expect(fingerprint).not.toContain("EXAMPLEKEY");
        expect(fingerprint).toBe("AKIA…3456");
    });

    it("does not leak a short key wholesale", () => {
        expect(accountFingerprint("abc")).toBe("ab…3");
    });

    it("is stable and distinguishes accounts", () => {
        expect(accountFingerprint("key-one-aaaa")).toBe(accountFingerprint("key-one-aaaa"));
        expect(accountFingerprint("key-one-aaaa")).not.toBe(accountFingerprint("key-two-bbbb"));
    });

    it("has a defined answer for a missing key", () => {
        expect(accountFingerprint(undefined)).toBe("none");
        expect(accountFingerprint("")).toBe("none");
    });
});
