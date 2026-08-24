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
 * BUG-0297 — the entry `orderPlacementService` actually builds, put in front of
 * the real gate.
 *
 * `orderPlacementService.test.ts` mocks `tradeService.placeOrder`, so it can
 * only ever assert what the placement service *intended*. That is the same
 * blind spot that hid the GTC re-introduction on FEAT-0017: three green suites,
 * none of them running the join. Here nothing between `placeEntryGroup` and the
 * gate is stubbed — only the network beneath it.
 *
 * The deadlock this pins: on a venue that cannot attach protection to an entry,
 * the placement service omits the stop from the payload (it must) while still
 * reporting it as displayed (it must — the size rule derives quantity from the
 * stop distance). The price rule read that as "a stop the payload forgot".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as string,
    apiKeys: {} as Record<string, { key: string; secret: string }>,
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

// The protection read that follows a placed entry. Reporting both levels
// present keeps `confirmProtection` off the retry path, which is not what
// these tests are about.
const plans = vi.hoisted(() => ({
    value: {} as Record<string, unknown>,
}));
vi.mock("../stores/tpsl.svelte", () => ({
    tpSlState: {
        invalidate: () => {},
        ensureFresh: async () => {},
        plansFor: () => plans.value,
    },
}));

import { tradeService } from "./tradeService";
import { orderPlacementService, type EntryPlan } from "./orderPlacementService";
import { marketState } from "../stores/market.svelte";
import { registerKillSwitch, registerRiskLimitCheck, registerAuditRecorder } from "./orderGate";

/** 1000 USDT account, 1 % risk, 500 stop distance → 10 / 500 = 0.02 BTC. */
function plan(overrides: Partial<EntryPlan> = {}): EntryPlan {
    return {
        exchange: "bitunix",
        symbol: "BTCUSDT",
        tradeType: "long",
        entryType: "limit",
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

let sent: Array<Record<string, unknown>> = [];

beforeEach(() => {
    sent = [];
    settings.apiProvider = "bitunix";
    settings.apiKeys = {
        bitunix: { key: "test-key-1234", secret: "s" },
        bitget: { key: "test-key-5678", secret: "s" },
    };
    plans.value = { loss: { id: "sl-1" }, profit: { id: "tp-1" } };
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

describe("BUG-0297 — an entry on a venue that cannot attach protection", () => {
    describe("a venue that attaches (Bitunix)", () => {
        it("places the entry with its stop and target on the payload", async () => {
            const result = await orderPlacementService.placeEntryGroup(plan());

            expect(result.entryPlaced).toBe(true);
            expect(result.refusal).toBeUndefined();
            expect(sent[0].slPrice).toBe("49500");
            expect(sent[0].tpPrice).toBe("51000");
        });
    });

    describe("a venue that cannot attach (Bitget)", () => {
        /*
         * The regression. Before the repair this came back
         * `entryPlaced: false` with `orderGate.missing` on `stopLoss` — the
         * trader had entered a stop and was told the order carried none.
         */
        it("places the entry instead of refusing it", async () => {
            settings.apiProvider = "bitget";

            const result = await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget" }),
            );

            expect(result.refusal).toBeUndefined();
            expect(result.entryPlaced).toBe(true);
        });

        it("sends no stop or target on the entry, since the venue cannot carry them", async () => {
            settings.apiProvider = "bitget";

            await orderPlacementService.placeEntryGroup(plan({ exchange: "bitget" }));

            expect(sent[0].slPrice).toBeUndefined();
            expect(sent[0].tpPrice).toBeUndefined();
        });

        /*
         * The stop is real, it just belongs to a second request. The trader is
         * told which of the two happened, because "attached" and "placed
         * separately" are different exposures.
         */
        it("reports the protection as placed separately, not as attached", async () => {
            settings.apiProvider = "bitget";

            const result = await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget" }),
            );

            expect(result.stopLoss).toBe("placed");
            expect(result.unprotected).toBe(false);
        });

        /*
         * The safety question this fix has to answer. Exempting the stop from
         * the entry's price rule is only acceptable because something else
         * still checks that it arrived — otherwise the trade-off would be
         * "accepts the order, loses the stop", which is worse than the
         * deadlock it replaces.
         */
        it("still calls the position unprotected when the separate stop never lands", async () => {
            settings.apiProvider = "bitget";
            plans.value = {}; // the follow-up request left no plan behind

            const result = await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget" }),
            );

            expect(result.entryPlaced).toBe(true);
            expect(result.unprotected).toBe(true);
            expect(result.stopLoss).not.toBe("placed");
        });

        it("still derives the quantity from the stop distance", async () => {
            settings.apiProvider = "bitget";

            await orderPlacementService.placeEntryGroup(plan({ exchange: "bitget" }));

            // 1000 × 1 % = 10 risk, ÷ 500 stop distance = 0.02. The size rule
            // reads the displayed stop even though the payload carries none;
            // that is the half of the split this fix must not disturb.
            expect(sent[0].qty).toBe("0.02");
        });
    });

    describe("what must still be refused", () => {
        /*
         * The exemption is scoped to the venue's declaration, not to the
         * caller's word for it. A payload whose stop disagrees with the
         * displayed one is still a mismatch wherever the venue attaches.
         */
        it("refuses a payload stop that disagrees with the displayed stop", async () => {
            const spy = vi.spyOn(tradeService, "placeOrder");
            spy.mockRestore();

            const result = await orderPlacementService.placeEntryGroup(plan());
            expect(result.entryPlaced).toBe(true);

            // Same order, but the transport is handed a different stop than
            // the one displayed — the gate compares and refuses.
            sent = [];
            await expect(
                tradeService.placeOrder({
                    symbol: "BTCUSDT",
                    side: "BUY",
                    orderType: "LIMIT",
                    qty: new Decimal("0.02"),
                    price: new Decimal(50000),
                    stopLoss: { price: new Decimal(49000) },
                    displayed: {
                        accountSize: new Decimal(1000),
                        riskPercentage: new Decimal(1),
                        entryPrice: new Decimal(50000),
                        stopLossPrice: new Decimal(49500),
                        accountStateAt: Date.now(),
                    },
                }),
            ).rejects.toThrow();
        });

        it("refuses an attached stop on a venue that declares it cannot carry one", async () => {
            settings.apiProvider = "bitget";

            // Nothing legitimate builds this — it is what a UI or caller that
            // ignored the capability would produce.
            await expect(
                tradeService.placeOrder({
                    symbol: "BTCUSDT",
                    side: "BUY",
                    orderType: "LIMIT",
                    qty: new Decimal("0.02"),
                    price: new Decimal(50000),
                    stopLoss: { price: new Decimal(49500) },
                    displayed: {
                        accountSize: new Decimal(1000),
                        riskPercentage: new Decimal(1),
                        entryPrice: new Decimal(50000),
                        stopLossPrice: new Decimal(49500),
                        accountStateAt: Date.now(),
                    },
                }),
            ).rejects.toThrow();
        });
    });
});
