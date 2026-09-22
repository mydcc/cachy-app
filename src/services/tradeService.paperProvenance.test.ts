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

/**
 * BUG-0494 — a bot's order carries its paper provenance.
 *
 * The bot's `paperEnabled()` pre-check and the transport's paper seam each
 * re-read mutable global state with an `await` and a module fetch between
 * them. A switch flipped in between used to send a never-clicked order to
 * the real venue. Stamped `bot`, the order is refused while paper trading is
 * off — at gate approval time and, as defence in depth, at the transport
 * seam — instead of falling through to the live branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix",
    accounts: [
        {
            id: "bitunix",
            name: "Bitunix",
            exchange: "bitunix",
            keys: { key: "test-key-1234", secret: "test-secret" },
        },
    ],
    activeAccountId: "bitunix",
    journalPaperTrades: true,
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

vi.mock("../lib/appAuth", () => ({
    appFetch: vi.fn(),
    appAuthHeaders: () => ({}),
}));

const exchangeSignedFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../utils/exchange/browserSigning", async (importOriginal) => {
    const original = await importOriginal<typeof import("../utils/exchange/browserSigning")>();
    return { ...original, exchangeSignedFetch: exchangeSignedFetchMock };
});

import { tradeService } from "./tradeService";
import { paperState } from "../stores/paperTrading.svelte";
import { marketState } from "../stores/market.svelte";
import {
    registerKillSwitch,
    registerRiskLimitCheck,
    BOT_PAPER_ONLY_MESSAGE_KEY,
} from "./orderGate";

/**
 * A well-formed manual-shaped entry: 1000 USDT account, 1 % risk, 500 stop
 * distance → 10 / 500 = 0.02 BTC, so the gate's re-derivation agrees.
 */
function entryParams(origin: "manual" | "bot") {
    return {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        origin,
        orderType: "MARKET" as const,
        qty: new Decimal("0.02"),
        stopLoss: { price: new Decimal(49500) },
        displayed: {
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
        },
    };
}

beforeEach(() => {
    localStorage.clear();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    exchangeSignedFetchMock.mockReset();
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
    // The flipped state: the bot's pre-check saw paper on, the transport
    // reads it off.
    paperState.setEnabled(false);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
});

describe("BUG-0494 — paper provenance", () => {
    it("refuses a bot-stamped order while paper is off and sends nothing live", async () => {
        const outcome = await tradeService.placeOrder(entryParams("bot")).then(
            (result) => ({ sent: true as const, result }),
            (error: unknown) => ({ sent: false as const, error }),
        );

        // Asserted first so a regression names the live request, not just a
        // missing refusal: on the pre-fix code this fails with one call.
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
        expect(outcome.sent).toBe(false);
        if (!outcome.sent) {
            expect(outcome.error).toMatchObject({
                refusal: { messageKey: BOT_PAPER_ONLY_MESSAGE_KEY },
            });
        }
    });

    it("still sends a manual order while paper is off", async () => {
        exchangeSignedFetchMock.mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ code: "0", data: {} }),
        });

        await tradeService.placeOrder(entryParams("manual"));

        expect(exchangeSignedFetchMock).toHaveBeenCalledTimes(1);
    });

    it("refuses at the transport seam even with a gate pass in hand", async () => {
        // Defence in depth, independent of the gate: provenance outranks the
        // pass, so no pass minting is needed to prove it.
        await expect(
            tradeService.signedRequest(
                "/api/orders",
                { type: "place-order", symbol: "BTCUSDT" },
                undefined,
                undefined,
                "bot",
            ),
        ).rejects.toMatchObject({
            refusal: { messageKey: BOT_PAPER_ONLY_MESSAGE_KEY },
        });
        expect(exchangeSignedFetchMock).not.toHaveBeenCalled();
    });

    it("leaves an unstamped transport call on its exact behaviour", async () => {
        // Absent means "not a bot order": without a pass this is still the
        // bypass refusal, not the provenance one.
        await expect(
            tradeService.signedRequest("/api/orders", { type: "place-order", symbol: "BTCUSDT" }),
        ).rejects.toMatchObject({ refusal: { messageKey: "orderGate.bypassed" } });
    });
});
