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
 * FEAT-0069 — a complete Bitunix order.
 *
 * This is also the first path with an `open` intent, so it is where the
 * FEAT-0011 gate's size recomputation and FEAT-0013's risk limits stop being
 * theoretical.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key-1234", secret: "s" } } }),
    },
}));
vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

import { tradeService } from "./tradeService";
import { marketState } from "../stores/market.svelte";
import {
    registerKillSwitch,
    registerRiskLimitCheck,
    registerAuditRecorder,
    OrderRefusedError,
    type OrderAttempt,
} from "./orderGate";

/** 1000 USDT account, 1 % risk, 500 stop distance → 10 / 500 = 0.02 BTC. */
function displayed() {
    return {
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49500),
        takeProfits: [new Decimal(51000)],
        leverage: new Decimal(10),
        marginMode: "ISOLATED",
        accountStateAt: Date.now(),
    };
}

function baseParams() {
    return {
        symbol: "BTCUSDT" as const,
        side: "BUY" as const,
        orderType: "LIMIT" as const,
        qty: new Decimal("0.02"),
        price: new Decimal(50000),
        takeProfit: { price: new Decimal(51000) },
        stopLoss: { price: new Decimal(49500) },
        displayed: displayed(),
    };
}

let sent: Array<Record<string, unknown>> = [];

beforeEach(() => {
    sent = [];
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
    marketState.setSymbolMeta("BTCUSDT", {
        symbol: "BTCUSDT",
        basePrecision: 4,
        quotePrecision: 2,
        minTradeVolume: null,
        maxLimitOrderVolume: null,
        maxMarketOrderVolume: null,
        minLeverage: 1,
        maxLeverage: 125,
        defaultLeverage: 10,
        priceProtectScope: null,
        symbolStatus: "OPEN",
        isApiSupported: true,
    });
    vi.spyOn(tradeService, "signedRequest").mockImplementation(async (_m, _e, payload) => {
        sent.push(payload);
        return { code: "0", data: { orderId: "o-1", clientId: payload.clientId } };
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
});

// AC: "An order placed with TP and SL set produces the position and its
// protective orders from a single place_order request."
describe("FEAT-0069 — TP and SL travel with the entry", () => {
    it("sends entry, take-profit and stop-loss in one request", async () => {
        await tradeService.placeOrder(baseParams());

        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "0.02",
            price: "50000",
            tpPrice: "51000",
            slPrice: "49500",
        });
    });

    it("defaults the trigger and order types rather than leaving them unset", async () => {
        await tradeService.placeOrder(baseParams());
        expect(sent[0]).toMatchObject({
            tpStopType: "MARK_PRICE",
            tpOrderType: "MARKET",
            slStopType: "MARK_PRICE",
            slOrderType: "MARKET",
        });
    });

    it("carries a LIMIT plan's own order price", async () => {
        await tradeService.placeOrder({
            ...baseParams(),
            takeProfit: {
                price: new Decimal(51000),
                orderType: "LIMIT",
                orderPrice: new Decimal("51000.1"),
            },
        });
        expect(sent[0]).toMatchObject({
            tpOrderType: "LIMIT",
            tpOrderPrice: "51000.1",
        });
    });

    it("omits the take-profit fields when no target was asked for", async () => {
        const params = baseParams();
        delete (params as Partial<typeof params>).takeProfit;
        await tradeService.placeOrder({
            ...params,
            displayed: { ...displayed(), takeProfits: undefined },
        });

        expect(sent[0].tpPrice).toBeUndefined();
        expect(sent[0].slPrice).toBe("49500");
    });

    it("refuses an entry with no stop at all, because its size is unverifiable", async () => {
        const params = baseParams();
        delete (params as Partial<typeof params>).stopLoss;

        // Not an oversight: FEAT-0011 derives the expected size from the stop
        // distance, so an entry without a stop has no second derivation to
        // check the quantity against. In an app whose whole premise is sizing
        // from a stop, refusing is the right answer — but it does mean
        // `placeOrder` cannot place a stop-less order.
        await expect(
            tradeService.placeOrder({
                ...params,
                displayed: { ...displayed(), stopLossPrice: undefined as never },
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);
        expect(sent).toHaveLength(0);
    });
});

// AC: "Every submission carries a unique clientId; resubmitting the same
// attempt reuses it."
describe("FEAT-0069 — client order id", () => {
    it("generates one per submission", async () => {
        const { clientId } = await tradeService.placeOrder(baseParams());
        expect(clientId).toMatch(/^cachy-/);
        expect(sent[0].clientId).toBe(clientId);
    });

    it("gives two separate attempts different ids", async () => {
        const a = await tradeService.placeOrder(baseParams());
        const b = await tradeService.placeOrder(baseParams());
        // Two deliberate identical entries — scaling in — must not collide,
        // which is why the id is not derived from the order's content.
        expect(a.clientId).not.toBe(b.clientId);
    });

    it("reuses the id when a caller retries the same attempt", async () => {
        const first = await tradeService.placeOrder(baseParams());
        await tradeService.placeOrder({ ...baseParams(), clientId: first.clientId });

        // A retry after an ambiguous response is exactly when a fresh id
        // would double the order.
        expect(sent[1].clientId).toBe(first.clientId);
    });

    it("fits the exchange's 64-character limit", () => {
        for (let i = 0; i < 50; i++) {
            expect(tradeService.newClientOrderId().length).toBeLessThanOrEqual(64);
        }
    });

    it("does not repeat itself across many calls", () => {
        const ids = new Set(
            Array.from({ length: 500 }, () => tradeService.newClientOrderId()),
        );
        expect(ids.size).toBe(500);
    });

    it("reaches the audit trail, so an attempt is identifiable after a crash", async () => {
        const attempts: OrderAttempt[] = [];
        registerAuditRecorder((a) => attempts.push(a));

        const { clientId } = await tradeService.placeOrder(baseParams());

        expect(attempts).toHaveLength(1);
        expect(attempts[0].payload.clientId).toBe(clientId);
    });
});

// AC: "`effect` is selectable (GTC default, IOC, FOK, POST_ONLY) for limit
// orders and omitted for market orders."
describe("FEAT-0069 — time in force", () => {
    it("defaults a limit order to GTC", async () => {
        await tradeService.placeOrder(baseParams());
        expect(sent[0].effect).toBe("GTC");
    });

    it.each(["IOC", "FOK", "POST_ONLY"] as const)("sends %s when asked", async (effect) => {
        await tradeService.placeOrder({ ...baseParams(), effect });
        expect(sent[0].effect).toBe(effect);
    });

    it("omits it for a market order", async () => {
        await tradeService.placeOrder({
            ...baseParams(),
            orderType: "MARKET",
            price: undefined,
            effect: "IOC",
        });
        // Documented as meaningful only for LIMIT; sending it anyway would
        // put a value in the audit record that the exchange ignored.
        expect(sent[0].effect).toBeUndefined();
    });
});

// AC: "All prices/quantities pass through decimal.js formatting; no native
// float serialisation."
describe("FEAT-0069 — Decimal formatting", () => {
    it("never emits scientific notation for a low-priced asset", async () => {
        // 1000 USDT at 1 % risk over a 1e-8 stop distance is 1e9 units — the
        // gate recomputes it, so the test has to send the real number.
        await tradeService.placeOrder({
            ...baseParams(),
            qty: new Decimal("1e9"),
            price: new Decimal("1e-7"),
            takeProfit: { price: new Decimal("1.2e-7") },
            stopLoss: { price: new Decimal("0.9e-7") },
            displayed: {
                ...displayed(),
                entryPrice: new Decimal("1e-7"),
                stopLossPrice: new Decimal("0.9e-7"),
                takeProfits: [new Decimal("1.2e-7")],
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1),
            },
        });

        // The exchange rejects "1e-7"; that is what formatApiNum exists for.
        for (const key of ["price", "tpPrice", "slPrice"]) {
            expect(String(sent[0][key])).not.toMatch(/e-/i);
        }
        expect(sent[0].price).toBe("0.0000001");
    });

    it("emits strings, never numbers", async () => {
        await tradeService.placeOrder(baseParams());
        for (const key of ["qty", "price", "tpPrice", "slPrice"]) {
            expect(typeof sent[0][key]).toBe("string");
        }
    });
});

// This is the first `open` intent in the codebase — the gate's strongest
// checks and every risk limit only ever applied to one, so until now they
// were reachable from tests alone.
describe("FEAT-0069 — the open path is gated", () => {
    it("is refused when the size disagrees with a fresh calculation", async () => {
        await expect(
            tradeService.placeOrder({ ...baseParams(), qty: new Decimal("0.2") }),
        ).rejects.toMatchObject({ refusal: { field: "qty" } });
        expect(sent).toHaveLength(0);
    });

    it("is refused when the kill switch is engaged", async () => {
        registerKillSwitch(() => true);
        await expect(tradeService.placeOrder(baseParams())).rejects.toMatchObject({
            refusal: { field: "killSwitch" },
        });
        expect(sent).toHaveLength(0);
    });

    it("is refused by a risk limit", async () => {
        registerRiskLimitCheck(() => ({
            field: "maxPositionSize",
            reason: "riskLimit" as const,
            messageKey: "orderGate.riskLimit",
            values: { field: "maxPositionSize", limit: "1", actual: "1000" },
        }));
        await expect(tradeService.placeOrder(baseParams())).rejects.toBeInstanceOf(
            OrderRefusedError,
        );
        expect(sent).toHaveLength(0);
    });

    it("is refused when the displayed stop disagrees with the payload", async () => {
        await expect(
            tradeService.placeOrder({
                ...baseParams(),
                stopLoss: { price: new Decimal(49000) },
            }),
        ).rejects.toMatchObject({ refusal: { field: "stopLoss" } });
    });

    it("is refused when the account state is stale", async () => {
        await expect(
            tradeService.placeOrder({
                ...baseParams(),
                displayed: { ...displayed(), accountStateAt: undefined },
            }),
        ).rejects.toMatchObject({ refusal: { field: "accountState" } });
    });

    it("tolerates rounding to the instrument's step size", async () => {
        // basePrecision 4 → step 0.0001, so 0.0201 is one step out and passes.
        await expect(
            tradeService.placeOrder({ ...baseParams(), qty: new Decimal("0.0201") }),
        ).resolves.toBeDefined();
    });
});

describe("FEAT-0067 — trading pair metadata rounding and limits in placeOrder", () => {
    it("rounds quantity to basePrecision and price to quotePrecision", async () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            basePrecision: 2,
            quotePrecision: 1,
            minTradeVolume: null,
            maxLimitOrderVolume: null,
            maxMarketOrderVolume: null,
            minLeverage: 1,
            maxLeverage: 125,
            defaultLeverage: 10,
            priceProtectScope: null,
            symbolStatus: "OPEN",
            isApiSupported: true,
        });

        await tradeService.placeOrder({
            ...baseParams(),
            qty: new Decimal("0.02"),
            price: new Decimal("50000.2"),
            takeProfit: { price: new Decimal("51000.3") },
            stopLoss: { price: new Decimal("49500.9") },
            displayed: {
                ...displayed(),
                entryPrice: new Decimal("50000.2"),
                stopLossPrice: new Decimal("49500.9"),
                takeProfits: [new Decimal("51000.3")],
                stepSize: new Decimal("0.01"),
            },
        });

        expect(sent).toHaveLength(1);
        expect(sent[0].qty).toBe("0.02");
        expect(sent[0].price).toBe("50000.2");
        expect(sent[0].tpPrice).toBe("51000.3");
        expect(sent[0].slPrice).toBe("49500.9");
    });

    it("refuses an order below minTradeVolume with a limit message", async () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: "0.1",
            maxLimitOrderVolume: null,
            maxMarketOrderVolume: null,
            minLeverage: 1,
            maxLeverage: 125,
            defaultLeverage: 10,
            priceProtectScope: null,
            symbolStatus: "OPEN",
            isApiSupported: true,
        });

        await expect(tradeService.placeOrder(baseParams())).rejects.toMatchObject({
            refusal: { field: "minTradeVolume", values: { limit: "0.1", actual: "0.02" } },
        });
        expect(sent).toHaveLength(0);
    });

    it("refuses an order above maxLimitOrderVolume", async () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: null,
            maxLimitOrderVolume: "0.01",
            maxMarketOrderVolume: null,
            minLeverage: 1,
            maxLeverage: 125,
            defaultLeverage: 10,
            priceProtectScope: null,
            symbolStatus: "OPEN",
            isApiSupported: true,
        });

        await expect(tradeService.placeOrder(baseParams())).rejects.toMatchObject({
            refusal: { field: "maxLimitOrderVolume", values: { limit: "0.01", actual: "0.02" } },
        });
        expect(sent).toHaveLength(0);
    });

    it("refuses an order when symbolStatus is not OPEN", async () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: null,
            maxLimitOrderVolume: null,
            maxMarketOrderVolume: null,
            minLeverage: 1,
            maxLeverage: 125,
            defaultLeverage: 10,
            priceProtectScope: null,
            symbolStatus: "CANCEL_ONLY",
            isApiSupported: true,
        });

        await expect(tradeService.placeOrder(baseParams())).rejects.toMatchObject({
            refusal: { field: "symbolStatus", values: { status: "CANCEL_ONLY" } },
        });
        expect(sent).toHaveLength(0);
    });

    it("refuses an order when isApiSupported is false", async () => {
        marketState.setSymbolMeta("BTCUSDT", {
            symbol: "BTCUSDT",
            basePrecision: 4,
            quotePrecision: 2,
            minTradeVolume: null,
            maxLimitOrderVolume: null,
            maxMarketOrderVolume: null,
            minLeverage: 1,
            maxLeverage: 125,
            defaultLeverage: 10,
            priceProtectScope: null,
            symbolStatus: "OPEN",
            isApiSupported: false,
        });

        await expect(tradeService.placeOrder(baseParams())).rejects.toMatchObject({
            refusal: { field: "isApiSupported" },
        });
        expect(sent).toHaveLength(0);
    });
});
