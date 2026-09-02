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
 * FEAT-0069's GTC default, against FEAT-0017's capability model.
 *
 * `tradeService.placeOrder` fills in GTC for a limit order that names no time
 * in force. That default is a real feature — Bitunix documents `effect` as
 * required on a limit order — but it was applied before anyone asked whether
 * the venue has a time in force at all.
 *
 * The result was a value nobody chose reaching the gate: `orderPlacementService`
 * correctly resolved `effect: undefined` for a venue declaring none, handed it
 * over, and `?? "GTC"` put it straight back. The order was then refused for
 * carrying a time in force the trader never selected and the UI showed as "—".
 *
 * Why the existing suites missed it: `orderPlacementService.test.ts` mocks
 * `tradeService.placeOrder`, so it only sees what was passed *in*;
 * `orderGate.capabilities.test.ts` builds payloads by hand. Neither runs the
 * join. This file mocks the settings store so the venue can be switched, and
 * exercises `placeOrder` for real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mutable, unlike the fixed `apiProvider: "bitunix"` in
// `tradeService_placeOrder.test.ts` — a venue that cannot be changed is a
// venue whose venue-specific behaviour cannot be tested.
const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    accounts: [
      { id: "bitunix", name: "Bitunix", exchange: "bitunix", keys: { key: "test-key-1234", secret: "s" } },
    ],
    activeAccountId: "bitunix" as Record<
        string,
        { key: string; secret: string }
    >,
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

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
} from "./orderGate";

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

/** A limit entry with protection attached — the Bitunix-shaped order. */
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
    settings.apiProvider = "bitunix";
    settings.apiKeys = {
        bitunix: { key: "test-key-1234", secret: "s" },
        bitget: { key: "test-key-5678", secret: "s" },
    };
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

/** The refusal a rejected order carries, or null if it was accepted. */
async function refusalOf(params: Parameters<typeof tradeService.placeOrder>[0]) {
    try {
        await tradeService.placeOrder(params);
        return null;
    } catch (e) {
        if (e instanceof OrderRefusedError) return e.refusal;
        throw e;
    }
}

describe("FEAT-0069 × FEAT-0017 — the GTC default meets venue capabilities", () => {
    describe("a venue that declares a time in force", () => {
        it("still defaults a limit order to GTC", async () => {
            await tradeService.placeOrder(baseParams());
            expect(sent[0].effect).toBe("GTC");
        });

        it("still honours an explicit value over the default", async () => {
            await tradeService.placeOrder({ ...baseParams(), effect: "POST_ONLY" });
            expect(sent[0].effect).toBe("POST_ONLY");
        });

        it("still sends none on a market order", async () => {
            await tradeService.placeOrder({
                ...baseParams(),
                orderType: "MARKET",
                price: undefined,
                effect: "IOC",
            });
            expect(sent[0].effect).toBeUndefined();
        });
    });

    describe("a venue that declares none", () => {
        /*
         * The regression this file exists for. Bitget declares
         * `timeInForce: []`, so there is no value the default could mean —
         * and inventing GTC had the gate refuse the order over a field the
         * trader never touched.
         *
         * The assertion is about *which* refusal, not whether one happens:
         * this fixture attaches protection, which Bitget declares it cannot
         * carry, so it is refused on that capability. What must not happen is
         * being refused over an invented time in force.
         */
        it("does not invent a time in force the trader never chose", async () => {
            settings.apiProvider = "bitget";

            const refusal = await refusalOf({ ...baseParams(), effect: undefined });

            expect(refusal?.field).not.toBe("effect");
            expect(refusal?.messageKey).not.toBe("orderGate.unsupportedTimeInForce");
        });

        it("passes an explicitly chosen value through, so the gate can refuse it out loud", async () => {
            settings.apiProvider = "bitget";

            const refusal = await refusalOf({ ...baseParams(), effect: "POST_ONLY" });

            // A maker-only instruction the venue cannot honour is refused by
            // name rather than quietly downgraded to "whatever fills".
            expect(refusal?.field).toBe("effect");
            expect(refusal?.values.timeInForce).toBe("POST_ONLY");
        });
    });

    describe("an undeclared venue", () => {
        it("invents nothing, having no declaration to default from", async () => {
            settings.apiProvider = "kraken";
            settings.apiKeys.kraken = { key: "test-key-9012", secret: "s" };

            const refusal = await refusalOf({ ...baseParams(), effect: undefined });

            // Refused on order type — the first capability an unknown venue
            // fails — never on a time in force nobody supplied.
            expect(refusal?.field).toBe("orderType");
        });
    });
});
