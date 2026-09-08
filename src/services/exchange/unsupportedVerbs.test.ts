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
 * FEAT-0229 — pre-trade control.
 *
 * The claim: a verb the venue cannot perform does not reach the transport.
 * These tests assert the *absence* of a call, not the presence of an error,
 * because the error is the symptom and the unsent request is the point.
 *
 * The read/write split is the other half. A read resolving empty is a true
 * answer; a write resolving quietly would let a trader believe a stop moved
 * when nothing happened, which is the failure this file exists to prevent.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ apiProvider: "bitget" as string }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("../bitunixWs", () => ({
    bitunixWs: { subscribe: vi.fn(), unsubscribe: vi.fn(), subscribeTrade: vi.fn(() => vi.fn()) },
}));
vi.mock("../bitgetWs", () => ({ bitgetWs: { subscribe: vi.fn(), unsubscribe: vi.fn() } }));
vi.mock("../apiService", () => ({
    apiService: {
        fetchTicker24h: vi.fn(),
        fetchMarketSnapshot: vi.fn(async () => []),
        fetchBitunixKlines: vi.fn(async () => []),
        fetchBitgetKlines: vi.fn(async () => []),
        fetchBitunixFundingRateHistory: vi.fn(async () => []),
    },
}));

const tradeServiceMock = vi.hoisted(() => ({
    placeOrder: vi.fn(async () => ({ ok: true })),
    addToPosition: vi.fn(async () => ({ ok: true })),
    closePosition: vi.fn(async () => ({ ok: true })),
    flashClosePosition: vi.fn(async () => ({ ok: true })),
    cancelOrder: vi.fn(async () => ({ ok: true })),
    cancelAllOrders: vi.fn(async () => ({ ok: true })),
    modifyOrder: vi.fn(async () => ({ ok: true })),
    fetchTpSlOrders: vi.fn(async () => [{ orderId: "1" }]),
    cancelTpSlOrder: vi.fn(async () => ({ ok: true })),
    modifyTpSlOrder: vi.fn(async () => ({ ok: true })),
    placePositionTpSl: vi.fn(async () => ({ ok: true })),
    placeTpSlOrder: vi.fn(async () => ({ ok: true })),
    fetchLeverageMarginMode: vi.fn(async () => undefined),
    fetchTradingPairInfo: vi.fn(async () => undefined),
    changeLeverage: vi.fn(async () => undefined),
    changeMarginMode: vi.fn(async () => undefined),
    changePositionMode: vi.fn(async () => undefined),
    adjustPositionMargin: vi.fn(async () => undefined),
}));
vi.mock("../tradeService", () => ({ tradeService: tradeServiceMock }));

import { getExchangeAdapter, activeExchange } from "./registry";
import { ExchangeUnsupportedError, isExchangeUnsupportedError } from "./errors";
import { getDisplayMessage } from "../../utils/errorUtils";

const bitget = () => getExchangeAdapter("bitget");
const bitunix = () => getExchangeAdapter("bitunix");

beforeEach(() => {
    vi.clearAllMocks();
    settings.apiProvider = "bitget";
});

describe("FEAT-0229 — a write the venue cannot do never reaches the transport", () => {
    it("refuses cancelTpSlOrder without calling tradeService", async () => {
        await expect(
            bitget().trading.cancelTpSlOrder({ orderId: "1" } as never),
        ).rejects.toBeInstanceOf(ExchangeUnsupportedError);
        expect(tradeServiceMock.cancelTpSlOrder).not.toHaveBeenCalled();
    });

    it("refuses modifyTpSlOrder without calling tradeService", async () => {
        await expect(
            bitget().trading.modifyTpSlOrder({
                orderId: "1",
                symbol: "BTCUSDT",
                planType: "LOSS",
                triggerPrice: "100",
            }),
        ).rejects.toBeInstanceOf(ExchangeUnsupportedError);
        expect(tradeServiceMock.modifyTpSlOrder).not.toHaveBeenCalled();
    });

    it("names the venue and the feature on the error", async () => {
        const error = await bitget()
            .trading.cancelTpSlOrder({ orderId: "1" } as never)
            .catch((e: unknown) => e);

        expect(isExchangeUnsupportedError(error)).toBe(true);
        const refusal = error as ExchangeUnsupportedError;
        expect(refusal.exchange).toBe("bitget");
        expect(refusal.feature).toBe("tpSl");
        expect(refusal.translationKey).toBe("exchange.unsupported.tpSl");
    });

    it("refuses through the active adapter too, not only when asked by id", async () => {
        await expect(
            activeExchange().trading.cancelTpSlOrder({ orderId: "1" } as never),
        ).rejects.toBeInstanceOf(ExchangeUnsupportedError);
        expect(tradeServiceMock.cancelTpSlOrder).not.toHaveBeenCalled();
    });
});

describe("FEAT-0229 — a read resolves empty instead of throwing", () => {
    it("returns no TP/SL plans and raises nothing", async () => {
        await expect(bitget().trading.fetchTpSlOrders("pending")).resolves.toEqual([]);
        expect(tradeServiceMock.fetchTpSlOrders).not.toHaveBeenCalled();
    });

    it("resolves the account reads locally rather than sending them", async () => {
        await expect(bitget().account.fetchLeverageMarginMode("BTCUSDT")).resolves.toBeUndefined();
        await expect(bitget().account.fetchTradingPairInfo("BTCUSDT")).resolves.toBeUndefined();
        expect(tradeServiceMock.fetchLeverageMarginMode).not.toHaveBeenCalled();
        expect(tradeServiceMock.fetchTradingPairInfo).not.toHaveBeenCalled();
    });
});

describe("FEAT-0229 — the guard is reachable only through a false support flag", () => {
    it("leaves Bitunix untouched: every verb still delegates", async () => {
        settings.apiProvider = "bitunix";

        await bitunix().trading.fetchTpSlOrders("pending");
        await bitunix().trading.cancelTpSlOrder({ orderId: "1" } as never);
        await bitunix().trading.modifyTpSlOrder({
            orderId: "1",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "100",
        });
        await bitunix().account.fetchLeverageMarginMode("BTCUSDT");
        await bitunix().account.fetchTradingPairInfo("BTCUSDT");

        expect(tradeServiceMock.fetchTpSlOrders).toHaveBeenCalledTimes(1);
        expect(tradeServiceMock.cancelTpSlOrder).toHaveBeenCalledTimes(1);
        expect(tradeServiceMock.modifyTpSlOrder).toHaveBeenCalledTimes(1);
        expect(tradeServiceMock.fetchLeverageMarginMode).toHaveBeenCalledTimes(1);
        expect(tradeServiceMock.fetchTradingPairInfo).toHaveBeenCalledTimes(1);
    });

    it("keeps the declaration and the behaviour in step", () => {
        // `supports` is the source the guards read. If someone flips a flag to
        // true without wiring the verb, this pairing is what fails first.
        expect(bitget().supports.tpSl).toBe(false);
        expect(bitunix().supports.tpSl).toBe(true);
        expect(bitget().supports.accountSettings).toBe(false);
        expect(bitunix().supports.accountSettings).toBe(true);
    });

    it("does not refuse the verbs Bitget genuinely has", async () => {
        await bitget().trading.cancelOrder("BTCUSDT", "1");
        await bitget().trading.closePosition({ symbol: "BTCUSDT", positionSide: "long" });
        expect(tradeServiceMock.cancelOrder).toHaveBeenCalledTimes(1);
        expect(tradeServiceMock.closePosition).toHaveBeenCalledTimes(1);
    });
});

describe("FEAT-0229 — the refusal reaches the trader as language, not as a key", () => {
    it("renders through getDisplayMessage with the venue interpolated", () => {
        const error = new ExchangeUnsupportedError("bitget", "tpSl", "cancelTpSlOrder");
        const translate = vi.fn(
            (key: string, vars?: Record<string, unknown>) =>
                `${key}|${JSON.stringify((vars as { values?: unknown })?.values)}`,
        );

        const rendered = getDisplayMessage(error, translate as never);

        expect(translate).toHaveBeenCalledWith("exchange.unsupported.tpSl", {
            values: { exchange: "Bitget" },
        });
        expect(rendered).toContain("exchange.unsupported.tpSl");
    });

    it("has a real string behind the key in both locales", async () => {
        const [de, en] = await Promise.all([
            import("../../locales/locales/de.json"),
            import("../../locales/locales/en.json"),
        ]);
        const deText = (de.default as Record<string, { unsupported: Record<string, string> }>)
            .exchange.unsupported.tpSl;
        const enText = (en.default as Record<string, { unsupported: Record<string, string> }>)
            .exchange.unsupported.tpSl;

        for (const text of [deText, enText]) {
            expect(text).toContain("{exchange}");
            expect(text.length).toBeGreaterThan(20);
        }
        expect(deText).not.toBe(enText);
    });
});

/*
 * The invariant, rather than a list of cases.
 *
 * FEAT-0016 shipped a test asserting that TP/SL delegated on both venues.
 * That was true then and false now, and it was only caught because this item
 * happened to touch the same verb. What follows removes the need for that
 * luck: every verb of every adapter is classified against its own `supports`
 * declaration, and the table has to name every verb the port exposes — so a
 * verb added later fails here until someone decides what it does on a venue
 * that cannot perform it.
 *
 * This is also the shape FEAT-0018's conformance suite grows into: the same
 * question asked of an adapter Cachy has not written yet.
 */

/** How a verb behaves when its venue cannot do it. */
type Kind = "write" | "read";

interface VerbSpec {
    /** The `supports` flag that gates it, or null if it is never gated. */
    gate: keyof import("./types").TradingSupport | null;
    kind: Kind;
    args: unknown[];
    /** The transport method it must reach when the venue does support it. */
    transport: keyof typeof tradeServiceMock | null;
}

const TRADING_VERBS: Record<string, VerbSpec> = {
    placeOrder: { gate: null, kind: "write", args: [{ symbol: "BTCUSDT" }], transport: "placeOrder" },
    // FEAT-0334. Not gated by `supports`: an add is an ordinary opening order
    // in the position's direction, so every venue whose trading transport
    // works at all can take one. Whether the *venue* accepts scaling in is
    // `capabilities.addToPosition`, which the position panel reads before it
    // offers the control — a different question from whether Cachy wired the
    // verb, which is what this table is about.
    addToPosition: {
        gate: null,
        kind: "write",
        args: [{ symbol: "BTCUSDT", positionSide: "long", amount: new Decimal(1) }],
        transport: "addToPosition",
    },
    closePosition: {
        gate: null,
        kind: "write",
        args: [{ symbol: "BTCUSDT", positionSide: "long" }],
        transport: "closePosition",
    },
    flashClosePosition: {
        gate: null,
        kind: "write",
        args: ["BTCUSDT", "long"],
        transport: "flashClosePosition",
    },
    cancelOrder: { gate: null, kind: "write", args: ["BTCUSDT", "1"], transport: "cancelOrder" },
    cancelAllOrders: { gate: null, kind: "write", args: ["BTCUSDT"], transport: "cancelAllOrders" },
    modifyOrder: { gate: null, kind: "write", args: [{ orderId: "1" }], transport: "modifyOrder" },
    fetchTpSlOrders: { gate: "tpSl", kind: "read", args: ["pending"], transport: "fetchTpSlOrders" },
    cancelTpSlOrder: {
        gate: "tpSl",
        kind: "write",
        args: [{ orderId: "1" }],
        transport: "cancelTpSlOrder",
    },
    modifyTpSlOrder: {
        gate: "tpSl",
        kind: "write",
        args: [{ orderId: "1", symbol: "BTCUSDT", planType: "LOSS", triggerPrice: "1" }],
        transport: "modifyTpSlOrder",
    },
    placePositionTpSl: {
        gate: "tpSl",
        kind: "write",
        args: [{ symbol: "BTCUSDT", positionId: "1", takeProfit: { price: new Decimal(70000) } }],
        transport: "placePositionTpSl",
    },
    placeTpSlOrder: {
        gate: "tpSl",
        kind: "write",
        args: [
            {
                symbol: "BTCUSDT",
                positionId: "1",
                takeProfit: { price: new Decimal(70000), qty: new Decimal("0.5") },
            },
        ],
        transport: "placeTpSlOrder",
    },
};

const ACCOUNT_VERBS: Record<string, VerbSpec> = {
    fetchLeverageMarginMode: {
        gate: "leverageMarginMode",
        kind: "read",
        args: ["BTCUSDT"],
        transport: "fetchLeverageMarginMode",
    },
    fetchTradingPairInfo: {
        gate: "tradingPairInfo",
        kind: "read",
        args: ["BTCUSDT"],
        transport: "fetchTradingPairInfo",
    },
    // FEAT-0068 — the write half of the account port. Writes, so an
    // unsupported venue refuses instead of resolving: a leverage change that
    // resolved quietly would leave the trader sizing against a number the
    // exchange never took.
    changeLeverage: {
        gate: "accountSettings",
        kind: "write",
        args: ["BTCUSDT", new Decimal(10)],
        transport: "changeLeverage",
    },
    changeMarginMode: {
        gate: "accountSettings",
        kind: "write",
        args: ["BTCUSDT", "ISOLATION"],
        transport: "changeMarginMode",
    },
    changePositionMode: {
        gate: "accountSettings",
        kind: "write",
        args: ["HEDGE"],
        transport: "changePositionMode",
    },
    adjustPositionMargin: {
        gate: "accountSettings",
        kind: "write",
        args: [{ symbol: "BTCUSDT", amount: new Decimal(10), side: "LONG" }],
        transport: "adjustPositionMargin",
    },
    // Not gated by `supports`: funding-rate history is a data gap, not a
    // trading capability. Bitunix serves it, Bitget resolves empty, and
    // neither reaches a trading transport — so it is exempt from the
    // delegation rule below and asserted on its own.
    fetchFundingRateHistory: { gate: null, kind: "read", args: ["BTCUSDT"], transport: null },
};

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

describe("FEAT-0229 — every verb is either delegated or declared, on every adapter", () => {
    for (const [portName, table] of [
        ["trading", TRADING_VERBS],
        ["account", ACCOUNT_VERBS],
    ] as const) {
        it(`the ${portName} table names every verb the port exposes`, () => {
            for (const adapter of [bitunix(), bitget()]) {
                // A verb added to the port without a decision about
                // unsupported venues fails here, not in front of a trader.
                expect(Object.keys(adapter[portName]).sort()).toEqual(Object.keys(table).sort());
            }
        });

        for (const [verb, spec] of Object.entries(table)) {
            for (const id of ["bitunix", "bitget"] as const) {
                it(`${id}.${portName}.${verb} behaves as its supports flag says`, async () => {
                    const adapter = getExchangeAdapter(id);
                    const supported = spec.gate === null || adapter.supports[spec.gate];
                    const port = adapter[portName] as Record<string, (...a: unknown[]) => unknown>;

                    const outcome = await Promise.resolve(port[verb](...spec.args)).catch(
                        (e: unknown) => e,
                    );
                    const transportCall = spec.transport ? tradeServiceMock[spec.transport] : null;

                    if (supported && transportCall) {
                        expect(outcome, `${verb} threw although ${id} supports it`).not.toBeInstanceOf(
                            Error,
                        );
                        expect(transportCall).toHaveBeenCalledTimes(1);
                        return;
                    }

                    if (transportCall) {
                        expect(
                            transportCall,
                            `${verb} reached the transport although ${id} declares it unsupported`,
                        ).not.toHaveBeenCalled();
                    }

                    if (!supported && spec.kind === "write") {
                        // A write must fail loudly. Resolving would let a
                        // trader believe something changed.
                        expect(isExchangeUnsupportedError(outcome)).toBe(true);
                        expect((outcome as ExchangeUnsupportedError).feature).toBe(spec.gate);
                        return;
                    }

                    // A read: empty is a true answer, an exception is not.
                    expect(outcome).not.toBeInstanceOf(Error);
                    expect(isEmpty(outcome), `${verb} resolved with data it cannot have`).toBe(true);
                });
            }
        }
    }
});
