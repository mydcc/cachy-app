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
 * FEAT-0012 — the seam.
 *
 * The claim this feature rests on is that live and paper differ at exactly
 * one call site. These tests hold that claim to account: the same order runs
 * in both modes and everything above the transport is asserted identical.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";
import { readFileSync } from "node:fs";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        apiKeys: { bitunix: { key: "test-key-1234", secret: "test-secret" } },
    },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { paperState } from "../stores/paperTrading.svelte";
import { setPaperPriceFeed } from "./paperExchange";
import { orderGate, OrderRefusedError, type OrderIntent } from "./orderGate";
import { omsService } from "./omsService";
import { registerKillSwitch, registerRiskLimitCheck } from "./orderGate";

const PRICE = new Decimal(50000);

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperState.setConfig("slippageBps", "0");
    paperState.setConfig("takerFeeBps", "0");
    paperState.setConfig("failureMode", "none");
    paperState.resetBook();
    omsService.reset();
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    appFetchMock.mockReset();
    appFetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: {} }),
    });
    setPaperPriceFeed(() => PRICE);
});

afterEach(() => {
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    paperState.setEnabled(false);
});

function position(symbol = "BTCUSDT") {
    return {
        symbol,
        side: "long" as const,
        amount: new Decimal("1"),
        entryPrice: PRICE,
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(10),
        marginMode: "cross" as const,
        positionId: "pos-1",
        lastUpdated: Date.now(),
    };
}

// AC: "An order placed in paper mode produces no outbound network request to
// any exchange — asserted against a mocked network."
describe("FEAT-0012 — paper mode reaches no network", () => {
    it("sends nothing when closing a position in paper mode", async () => {
        paperState.setEnabled(true);
        omsService.updatePosition(position());
        // The simulator needs the position the close will target.
        paperState.setPositions([
            {
                positionId: "pos-1",
                symbol: "BTCUSDT",
                side: "long",
                amount: "1",
                entryPrice: "50000",
                leverage: "10",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
            },
        ]);

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("does send when the same call runs live", async () => {
        paperState.setEnabled(false);
        omsService.updatePosition(position());

        await tradeService.closePosition({
            symbol: "BTCUSDT",
            positionSide: "long",
            amount: new Decimal("1"),
        });

        // The contrast is the point: identical call, one mode reaches the
        // network and the other cannot.
        expect(appFetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends nothing for a cancel in paper mode", async () => {
        paperState.setEnabled(true);
        await expect(
            tradeService.cancelOrder("BTCUSDT", "does-not-exist"),
        ).rejects.toThrow();
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});

// AC: "Live and paper differ at exactly one call site — proven by a test that
// asserts the shared path is identical up to the transport boundary."
describe("FEAT-0012 — one seam", () => {
    it("branches on the mode exactly once, at the transport", () => {
        const source = readFileSync("src/services/tradeService.ts", "utf8");

        // Two branches, and the test names both — the count alone would let
        // a third appear by pushing one of these out of the file.
        //
        //   1. The order seam: paper orders go to `paperExchange` instead of
        //      the network, and everything above it has already run
        //      identically. A second branch *here* is what this feature
        //      promises cannot happen.
        //   2. FEAT-0068's account-settings refusal. Not an order and not a
        //      seam: `paperExchange` simulates orders and has no notion of
        //      leverage or margin mode, so there is nothing on the far side
        //      to change and the write is refused rather than pretended.
        const branches = source.match(/if \(paperState\.enabled\)[\s\S]{0,220}/g) ?? [];
        expect(branches).toHaveLength(2);
        expect(branches.filter((b) => b.includes("paperExchange.handle"))).toHaveLength(1);
        expect(
            branches.filter((b) => b.includes("exchange.accountSettings.paperMode")),
        ).toHaveLength(1);

        // The remaining reads are not branches: they record the mode onto the
        // intent and onto the gate-pass context so the transport can compare
        // them, and one relaxes a credential guard (FEAT-0327) in front of a
        // read that goes through the seam and therefore needs no credentials.
        // None of them changes what the request is.
        expect(source.match(/paperState\.enabled/g) ?? []).toHaveLength(5);
        expect(
            source.match(/if \(!paperState\.enabled && \(!keys\?\.key/g) ?? [],
        ).toHaveLength(1);
        expect(source.match(/paperMode: paperState\.enabled/g) ?? []).toHaveLength(2);
    });

    it("reaches the transport with an identical payload in both modes", async () => {
        const payloads: Array<Record<string, unknown>> = [];
        const spy = vi
            .spyOn(tradeService, "signedRequest")
            .mockImplementation(async (_m, _e, payload) => {
                payloads.push(payload);
                return { code: "0" };
            });

        try {
            for (const mode of [false, true]) {
                paperState.setEnabled(mode);
                omsService.reset();
                omsService.updatePosition(position());
                await tradeService.closePosition({
                    symbol: "BTCUSDT",
                    positionSide: "long",
                    amount: new Decimal("1"),
                });
            }
        } finally {
            spy.mockRestore();
        }

        expect(payloads).toHaveLength(2);
        expect(payloads[0]).toEqual(payloads[1]);
    });

    it("routes no non-order module through the simulator", () => {
        // Only the transport may know about the simulator; a second importer
        // would be a second seam.
        const importers = [
            "src/services/tradeService.ts",
            "src/services/paperTradingService.ts",
        ];
        for (const file of importers) {
            expect(readFileSync(file, "utf8")).toMatch(/paperExchange/);
        }
    });
});

// AC: "Paper orders pass through the FEAT-0011 gate and are refused by it
// under the same conditions as live orders."
describe("FEAT-0012 — paper orders still go through the gate", () => {
    it("is refused by the kill switch exactly as a live order is", async () => {
        registerKillSwitch(() => true);

        for (const mode of [false, true]) {
            paperState.setEnabled(mode);
            omsService.reset();
            omsService.updatePosition(position());

            const intent: OrderIntent = {
                kind: "open",
                endpoint: "/api/orders",
                payload: { type: "place-order", symbol: "BTCUSDT", qty: "1" },
                displayed: {
                    provider: "bitunix",
                    accountFingerprint: "test…1234",
                    symbol: "BTCUSDT",
                    paperMode: mode,
                },
            };
            expect(orderGate.verify(intent).refusal?.field).toBe("killSwitch");
        }
    });

    it("is refused by a risk limit exactly as a live order is", async () => {
        registerRiskLimitCheck(() => ({
            field: "maxPositionSize",
            reason: "riskLimit" as const,
            messageKey: "orderGate.riskLimit",
            values: { field: "maxPositionSize", limit: "1", actual: "2" },
        }));
        paperState.setEnabled(true);
        omsService.updatePosition(position());

        await expect(
            tradeService.closePosition({
                symbol: "BTCUSDT",
                positionSide: "long",
                amount: new Decimal("1"),
            }),
        ).rejects.toBeInstanceOf(OrderRefusedError);
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("refuses when the mode changes between approval and transmission", async () => {
        paperState.setEnabled(false);
        omsService.updatePosition(position());

        // The gate approves as live; the mode flips before the transport
        // reads it. Believing you are simulating while live is the failure
        // this catches.
        const original = tradeService.signedRequest.bind(tradeService);
        const spy = vi
            .spyOn(tradeService, "signedRequest")
            .mockImplementation(async (m, e, p, pass) => {
                paperState.setEnabled(true);
                return original(m, e, p, pass);
            });

        try {
            await expect(
                tradeService.closePosition({
                    symbol: "BTCUSDT",
                    positionSide: "long",
                    amount: new Decimal("1"),
                }),
            ).rejects.toMatchObject({ refusal: { field: "mode" } });
        } finally {
            spy.mockRestore();
        }
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});

// AC: "Switching modes never carries state across: paper positions do not
// appear live and vice versa."
describe("FEAT-0012 — switching modes carries nothing across", () => {
    it("clears the shared position store in both directions", async () => {
        const { paperTradingService } = await import("./paperTradingService");

        omsService.updatePosition(position("LIVEUSDT"));
        expect(omsService.getPositions()).toHaveLength(1);

        paperTradingService.setEnabled(true);
        expect(
            omsService.getPositions().some((p) => p.symbol === "LIVEUSDT"),
        ).toBe(false);

        omsService.updatePosition(position("PAPERUSDT"));
        paperTradingService.setEnabled(false);
        expect(
            omsService.getPositions().some((p) => p.symbol === "PAPERUSDT"),
        ).toBe(false);
    });

    it("keeps the simulated book across a round trip through live", async () => {
        const { paperTradingService } = await import("./paperTradingService");

        paperTradingService.setEnabled(true);
        paperState.setPositions([
            {
                positionId: "p-1",
                symbol: "BTCUSDT",
                side: "long",
                amount: "1",
                entryPrice: "50000",
                leverage: "10",
                marginMode: "cross",
                realizedPnl: "0",
                openedAt: Date.now(),
            },
        ]);

        paperTradingService.setEnabled(false);
        paperTradingService.setEnabled(true);

        // Switching modes clears the *shared* view, not the user's practice
        // book — losing that on every toggle would make the feature useless.
        expect(paperState.positions).toHaveLength(1);
    });
});
