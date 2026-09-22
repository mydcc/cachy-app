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
    // Starts with no credentials; individual tests fill the account in.
    accounts: [
        {
            id: "bitunix",
            name: "Bitunix",
            exchange: "bitunix",
            keys: { key: "", secret: "" },
        },
    ],
    activeAccountId: "bitunix",
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

// The protection read that follows a placed entry. `ordersFor` is sequenced:
// the first call of a placement is the before-image, taken before the entry
// exists, so it sees nothing; later calls see what the venue published.
// A single constant object would model "the same plan before and after",
// which the fix under test correctly reads as stale. Production legs always
// carry planType, so the pair is stamped here.
const plans = vi.hoisted(() => ({
    calls: 0,
    before: {} as Record<string, unknown>,
    after: {} as Record<string, unknown>,
}));
function asList(pair: Record<string, unknown>): Array<Record<string, unknown>> {
    return [
        ...(pair.loss ? [{ ...(pair.loss as Record<string, unknown>), planType: "LOSS" }] : []),
        ...(pair.profit ? [{ ...(pair.profit as Record<string, unknown>), planType: "PROFIT" }] : []),
    ];
}
vi.mock("../stores/tpsl.svelte", () => ({
    tpSlState: {
        invalidate: () => {},
        ensureFresh: async () => {},
        plansFor: () => {
            plans.calls += 1;
            return plans.calls === 1 ? plans.before : plans.after;
        },
        ordersFor: () => {
            plans.calls += 1;
            return asList(plans.calls === 1 ? plans.before : plans.after);
        },
    },
}));

import { tradeService } from "./tradeService";
import { orderPlacementService, type EntryPlan } from "./orderPlacementService";
import { marketState } from "../stores/market.svelte";
import { orderGate, registerKillSwitch, registerRiskLimitCheck, registerAuditRecorder } from "./orderGate";

/** 1000 USDT account, 1 % risk, 500 stop distance → 10 / 500 = 0.02 BTC. */
function plan(overrides: Partial<EntryPlan> = {}): EntryPlan {
    return {
        exchange: "bitunix",
        symbol: "BTCUSDT",
        // BUG-0494 — existing cases exercise manual flows; the provenance is
        // stated so the required field does not change what they assert.
        origin: "manual",
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
    settings.accounts = [
        {
            id: "bitunix",
            name: "Bitunix",
            exchange: "bitunix",
            keys: { key: "test-key-1234", secret: "s" },
        },
        {
            id: "bitget",
            name: "Bitget",
            exchange: "bitget",
            keys: { key: "test-key-5678", secret: "s" },
        },
    ];
    plans.calls = 0;
    plans.before = {};
    // What the venue published for the new entry: fresh ids, the requested
    // prices, this entry's side. Present keeps `confirmProtection` off the
    // retry path, which is not what these tests are about.
    plans.after = {
        loss: { orderId: "plan-sl-1", triggerPrice: "49500", side: "BUY" },
        profit: { orderId: "plan-tp-1", triggerPrice: "51000", side: "BUY" },
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
    vi.spyOn(tradeService, "signedRequest").mockImplementation(async (_e, payload) => {
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

    describe("a venue with no stop path at all (Bitget, BUG-0503)", () => {
        /*
         * BUG-0503 reverses the BUG-0297 outcome above for this venue: excusing
         * the stop from comparison made the order acceptable without making
         * the protection possible, and every Bitget entry carrying a stop
         * opened a position no later request could protect. The gate now
         * refuses such an entry before anything is sent. The regression
         * assertion is the `sent` array: a refusal that still transmitted
         * would fail here, not just on the verdict.
         */
        it("refuses the entry before anything is sent", async () => {
            settings.apiProvider = "bitget";

            const result = await orderPlacementService.placeEntryGroup(
                plan({ exchange: "bitget" }),
            );

            expect(result.entryPlaced).toBe(false);
            expect(result.unprotected).toBe(false);
            expect(result.refusal?.messageKey).toBe("orderGate.unplaceableStop");
            expect(result.refusal?.values.exchange).toBe("bitget");
            expect(sent).toEqual([]);
        });

        /*
         * The way out is deliberate, not silent: clearing the stop field
         * places a stopless entry the trader explicitly chose. Quantity
         * 0.0002 is what the size rule re-derives from the inputs below
         * (1000 × 1 % ÷ 50000), so passing proves the gate measured this
         * order rather than waving it through.
         */
        it("still places a deliberately stopless entry", async () => {
            settings.apiProvider = "bitget";

            const result = await orderPlacementService.placeEntryGroup(
                plan({
                    exchange: "bitget",
                    stopLossPrice: new Decimal(0),
                    takeProfits: [],
                    qty: new Decimal("0.0002"),
                }),
            );

            expect(result.refusal).toBeUndefined();
            expect(result.entryPlaced).toBe(true);
            expect(result.stopLoss).toBe("none");
            expect(result.unprotected).toBe(false);
            expect(sent).toHaveLength(1);
        });
    });

    describe("what must still be refused", () => {
        /*
         * The exemption is scoped to the venue's declaration, not to the
         * caller's word for it. A payload whose stop disagrees with the
         * displayed one is still a mismatch wherever the venue attaches.
         */
        it("refuses a payload stop that disagrees with the displayed stop", async () => {
            const result = await orderPlacementService.placeEntryGroup(plan());
            expect(result.entryPlaced).toBe(true);

            // Same order, but the transport is handed a different stop than
            // the one displayed — the gate compares and refuses.
            sent = [];
            await expect(
                tradeService.placeOrder({
                    symbol: "BTCUSDT",
                    side: "BUY",
                    // BUG-0494 — these cases exercise manual flows.
                    origin: "manual",
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
                    // BUG-0494 — these cases exercise manual flows.
                    origin: "manual",
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

/*
 * FEAT-0026 review findings.
 *
 * Observed at `orderGate.submit`, because that is where the property lives:
 * what the *pass* carries. `signedRequest` is mocked in this file and never
 * builds a transport context, so an assertion on the happy path here proves
 * nothing — a first draft of these tests passed against the unfixed code for
 * exactly that reason.
 */
describe("the account id the pass carries", () => {
    /** The intent the gate was handed, captured without changing behaviour. */
    function captureIntent() {
        const seen: { accountId?: string }[] = [];
        const original = orderGate.submit.bind(orderGate);
        vi.spyOn(orderGate, "submit").mockImplementation(async (intent, send) => {
            seen.push(intent.displayed as { accountId?: string });
            return original(intent, send);
        });
        return seen;
    }

    const fullOrder = (displayed: Record<string, unknown>) => ({
        symbol: "BTCUSDT",
        side: "BUY" as const,
        // BUG-0494 — these cases exercise manual flows.
        origin: "manual" as const,
        orderType: "LIMIT" as const,
        qty: new Decimal("0.02"),
        price: new Decimal(50000),
        stopLoss: { price: new Decimal(49500) },
        displayed: {
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
            accountStateAt: Date.now(),
            ...displayed,
        },
    });

    /*
     * Finding 1. The id used to be `settingsState.activeAccountId`, read raw,
     * while the credentials came from a venue-scoped lookup that falls back
     * when the active id names an account on another exchange. The id then
     * named an account the signature did not belong to.
     */
    it("names the account whose credentials will sign, not the raw active id", async () => {
        settings.apiProvider = "bitunix";
        settings.activeAccountId = "bitget"; // active is the Bitget account
        const seen = captureIntent();

        await tradeService.placeOrder(fullOrder({}));

        // The Bitunix account signs, so the Bitunix account is named.
        expect(seen[0].accountId).toBe("bitunix");
    });

    /*
     * Finding 3. `accountId` is absent from `PartialIntent`'s omit list and
     * `completeIntent` spread the caller's `displayed` over the store's, so
     * `accountId: undefined` blanked the real id — and `assertGatePass` skips
     * the comparison when the pass carries none. An ordinary assignment could
     * switch off a money-critical check with nothing going red.
     */
    it("survives a caller passing undefined, so the check cannot be switched off", async () => {
        settings.apiProvider = "bitunix";
        settings.activeAccountId = "bitunix";
        const seen = captureIntent();

        await tradeService.placeOrder(fullOrder({ accountId: undefined }));

        expect(seen[0].accountId).toBe("bitunix");
    });

    it("refuses a caller that names an account other than the resolved one", async () => {
        settings.apiProvider = "bitunix";
        settings.activeAccountId = "bitunix";

        // Asserted on the field, not merely that it threw: an incomplete
        // fixture refuses on `qty.inputs` and would pass without the account
        // check existing at all.
        await expect(
            tradeService.placeOrder(fullOrder({ accountId: "some-other-account" })),
        ).rejects.toMatchObject({ refusal: { field: "account" } });
    });
});
