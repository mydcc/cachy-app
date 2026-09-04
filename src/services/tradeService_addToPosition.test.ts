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
 * FEAT-0334 — the seam between `addToPosition` and the gate.
 *
 * `addToPosition.test.ts` proves the arithmetic and `orderGate.add.test.ts`
 * proves the gate, each against inputs the other never sees. That leaves the
 * one defect both suites would miss: a service that builds a payload the gate
 * does not accept, or worse, one it accepts for the wrong trade.
 *
 * So every test here goes through the real `tradeService.addToPosition` into
 * the real `orderGate`, and asserts on what came out the far end — the payload
 * handed to the transport. Nothing between them is stubbed.
 *
 * The side mapping is the reason this file exists. Bitunix's `side` names the
 * *position*, not the order direction, when `tradeSide` is present
 * (docs/bitunix-api/07_trade.md: "Open Long: side=BUY, tradeSide=OPEN"), which
 * is why closing a long also sends BUY. Getting that inverted would open
 * exposure the opposite way — the single most expensive defect this change
 * could ship, and one no unit test of either half would catch.
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
import { omsService } from "./omsService";
import { marketState } from "../stores/market.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";
import {
    registerKillSwitch,
    registerRiskLimitCheck,
    registerAuditRecorder,
    OrderRefusedError,
    type OrderAttempt,
} from "./orderGate";

/** A 1 BTC long at 30 000, marking 28 000, 10×, isolated. */
function longPosition(over: Record<string, unknown> = {}) {
    return {
        symbol: "BTCUSDT",
        side: "long" as const,
        amount: new Decimal(1),
        entryPrice: new Decimal(30_000),
        markPrice: new Decimal(28_000),
        unrealizedPnl: new Decimal(-2000),
        leverage: new Decimal(10),
        marginMode: "isolated" as const,
        positionId: "pos-1",
        lastUpdated: Date.now(),
        ...over,
    };
}

let sent: Array<Record<string, unknown>> = [];
let attempts: OrderAttempt[] = [];

function givePosition(position: Record<string, unknown>) {
    vi.spyOn(omsService, "getPositions").mockReturnValue([position] as never);
}

/** Free margin the account reports, as the balance channel would leave it. */
function giveBalance(available: Decimal) {
    accountState.assets = [
        {
            currency: "USDT",
            available,
            margin: new Decimal(0),
            frozen: new Decimal(0),
            total: available,
        },
    ] as never;
}

beforeEach(() => {
    sent = [];
    attempts = [];
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder((a) => attempts.push(a));
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
    // The venue-confirmed leverage/margin-mode read the gate checks for
    // freshness. Absent, every add is refused as stale — which is exactly what
    // this suite caught, and why it is set here rather than assumed.
    tradeState.remoteAccountStateAt = Date.now();
    giveBalance(new Decimal(50_000));
    givePosition(longPosition());
    vi.spyOn(tradeService, "signedRequest").mockImplementation(async (_m, _e, payload) => {
        sent.push(payload);
        return { code: "0", data: { orderId: "o-1", clientId: payload.clientId } };
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    accountState.assets = [] as never;
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
});

describe("FEAT-0334 — an add the gate actually approves", () => {
    it("reaches the transport rather than being refused", async () => {
        // The claim the two unit suites cannot make between them: the payload
        // this service builds is one this gate lets through.
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(sent).toHaveLength(1);
        expect(attempts[0]?.outcome).toBe("sent");
        expect(attempts[0]?.refusal).toBeUndefined();
    });

    it("records the attempt as an add, not as an open", async () => {
        // The audit trail has to say what actually happened. An add filed as
        // an `open` would misdescribe how it was verified.
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(attempts[0]?.kind).toBe("add");
        expect(attempts[0]?.action).toBe("place-order");
    });

    it("is checked against available margin and the step size", async () => {
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        // Not merely approved — approved *having actually run* the checks this
        // feature added. An approval that skipped them would pass the test above.
        expect(attempts[0]?.checked).toContain("availableMargin");
        expect(attempts[0]?.checked).toContain("stepSize");
        expect(attempts[0]?.checked).toContain("qty");
    });
});

describe("FEAT-0334 — the side mapping", () => {
    it("opens a long with side BUY and tradeSide OPEN", async () => {
        // docs/bitunix-api/07_trade.md: "Open Long: side=BUY, tradeSide=OPEN".
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(sent[0]).toMatchObject({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            tradeSide: "OPEN",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: false,
            positionId: "pos-1",
        });
    });

    it("opens a short with side SELL and tradeSide OPEN", async () => {
        // "Open Short: side=SELL, tradeSide=OPEN". Inverting this would add
        // to a short by buying, which closes it instead.
        givePosition(
            longPosition({
                side: "short",
                entryPrice: new Decimal(30_000),
                markPrice: new Decimal(32_000),
                unrealizedPnl: new Decimal(-2000),
                positionId: "pos-2",
            }),
        );

        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "short",
            amount: new Decimal("0.5"),
        });

        expect(sent[0]).toMatchObject({
            side: "SELL",
            tradeSide: "OPEN",
            reduceOnly: false,
            positionId: "pos-2",
        });
    });

    it("never sends reduceOnly — an add is not a reduce", async () => {
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
        });

        expect(sent[0].reduceOnly).toBe(false);
        expect(sent[0].tradeSide).not.toBe("CLOSE");
    });
});

describe("FEAT-0334 — refusals reach the caller", () => {
    it("refuses an add that exceeds available margin", async () => {
        // 3 BTC at the 28 000 mark is 84 000 notional; at 10× that needs
        // 8 400 margin against 5 000 free.
        giveBalance(new Decimal(5000));

        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal(3),
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);

        expect(sent).toHaveLength(0);
        expect(attempts[0]?.outcome).toBe("refused");
        expect(attempts[0]?.refusal?.field).toBe("availableMargin");
    });

    it("prices the margin check off the mark for a market add", async () => {
        // The position marks at 28 000 while its entry is 30 000. Checking
        // against the entry would allow a size the mark cannot fund, and
        // checking against the mark is what the panel previewed.
        giveBalance(new Decimal(2900));

        // 1 BTC at the 28 000 mark over 10× is 2 800 — fundable.
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal(1),
        });
        expect(sent).toHaveLength(1);
    });

    it("refuses an add on a position the venue does not report", async () => {
        vi.spyOn(omsService, "getPositions").mockReturnValue([] as never);
        vi.spyOn(tradeService, "fetchOpenPositionsFromApi").mockResolvedValue(undefined as never);

        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("0.5"),
            }),
        ).rejects.toThrow();

        expect(sent).toHaveLength(0);
    });

    it("refuses a non-positive quantity before it reaches the gate", async () => {
        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal(0),
            }),
        ).rejects.toThrow("apiErrors.invalidAmount");

        expect(sent).toHaveLength(0);
    });

    it("refuses a limit add with no price", async () => {
        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("0.5"),
                orderType: "LIMIT",
            }),
        ).rejects.toThrow("apiErrors.invalidPrice");

        expect(sent).toHaveLength(0);
    });

    it("is stopped by the kill switch, because an add opens exposure", async () => {
        // The regression this guards: `increasesExposure` returning false for
        // "add" would leave scaling in as the one way past a kill switch.
        registerKillSwitch(() => true);

        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("0.5"),
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);

        expect(sent).toHaveLength(0);
    });

    it("is subject to the FEAT-0013 risk-limit hook", async () => {
        registerRiskLimitCheck(() => ({
            field: "dailyLoss",
            reason: "riskLimit",
            messageKey: "orderGate.riskLimit",
            values: { field: "dailyLoss" },
        }));

        await expect(
            tradeService.addToPosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("0.5"),
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);

        expect(sent).toHaveLength(0);
    });
});

describe("FEAT-0334 — a limit add", () => {
    it("carries its limit price and checks margin against it", async () => {
        await tradeService.addToPosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("0.5"),
            orderType: "LIMIT",
            price: new Decimal(27_000),
        });

        expect(sent[0]).toMatchObject({
            orderType: "LIMIT",
            price: "27000",
            qty: "0.5",
            tradeSide: "OPEN",
        });
    });
});
