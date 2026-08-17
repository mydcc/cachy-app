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
    closePosition: vi.fn(async () => ({ ok: true })),
    cancelOrder: vi.fn(async () => ({ ok: true })),
    cancelAllOrders: vi.fn(async () => ({ ok: true })),
    modifyOrder: vi.fn(async () => ({ ok: true })),
    fetchTpSlOrders: vi.fn(async () => [{ orderId: "1" }]),
    cancelTpSlOrder: vi.fn(async () => ({ ok: true })),
    modifyTpSlOrder: vi.fn(async () => ({ ok: true })),
    fetchLeverageMarginMode: vi.fn(async () => undefined),
    fetchTradingPairInfo: vi.fn(async () => undefined),
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
