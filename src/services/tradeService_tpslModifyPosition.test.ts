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
 * BUG-0687 — adding the missing leg to an existing position-wide plan.
 *
 * The venue allows exactly one position-wide plan per position, so the second
 * leg cannot be created: `position/place_order` replaces the plan and cancels
 * the leg that was already set. What these cover is that the service reaches
 * `position/modify_order` instead — the endpoint that rewrites the plan in
 * place — and that both legs travel, because a modify that names only the new
 * leg asks the venue to decide what happens to the existing one.
 *
 * `position/modify_order` is one of the two TP/SL write paths that were never
 * wired (INTEGRATION_STATUS.md); the sibling test for the create paths is
 * `tradeService_tpslPlacement.test.ts`.
 */

import { migrateAccounts } from "../stores/settings/accounts";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";
import { Decimal } from "decimal.js";

vi.mock("./omsService", () => ({
    omsService: {
        getPositions: vi.fn(() => []),
        updatePosition: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        updateOrder: vi.fn(),
    },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        apiProvider: "bitunix",
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key", secret: "test-secret" } } }),
        appAccessToken: "test-token",
        secretsReady: Promise.resolve(),
    },
}));

vi.mock("../stores/market.svelte", async () => {
    const { Decimal } = await import("decimal.js");
    return {
        marketState: {
            data: { BTCUSDT: { lastPrice: new Decimal(60000) } },
            symbolMeta: {},
        },
    };
});

vi.mock("./logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

/** The order-gate pass every state-mutating call carries; see FEAT-0011. */
const GATE_PASS = expect.anything();
const CONTEXT = { side: "long" as const, entryPrice: new Decimal(60000) };

function spyRequest() {
    return vi
        .spyOn(tradeService, "signedRequest")
        .mockResolvedValue({ orderId: "tp-1" });
}

/** The params object as it reached the proxy route. */
function sentParams(spy: ReturnType<typeof spyRequest>): Record<string, unknown> {
    const body = spy.mock.calls[0][1] as { params: Record<string, unknown> };
    return body.params;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BUG-0687 — modify-position TP/SL", () => {
    it("targets the modify endpoint, not the create one", async () => {
        const spy = spyRequest();

        await tradeService.modifyPositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            context: CONTEXT,
            takeProfit: { price: new Decimal(70000) },
            stopLoss: { price: new Decimal(55000) },
        });

        expect(spy).toHaveBeenCalledTimes(1);
        const [endpoint, body] = spy.mock.calls[0];
        expect(endpoint).toBe("/api/tpsl");
        expect((body as { action: string }).action).toBe("modify-position");
        expect(spy).toHaveBeenCalledWith(
            "/api/tpsl",
            expect.anything(),
            GATE_PASS,
            undefined,
            undefined,
        );
    });

    it("sends both legs so the venue rewrites the plan's full leg set", async () => {
        const spy = spyRequest();

        await tradeService.modifyPositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            context: CONTEXT,
            takeProfit: { price: new Decimal(70000), stopType: "LAST_PRICE" },
            stopLoss: { price: new Decimal(55000) },
        });

        const params = sentParams(spy);
        expect(params.tpPrice).toBe("70000");
        expect(params.tpStopType).toBe("LAST_PRICE");
        expect(params.slPrice).toBe("55000");
        expect(params.positionId).toBe("pos-1");
    });

    it("defaults a stop type that was not carried over", async () => {
        // The carried-over leg's type comes from the plan; when the plan does
        // not say, the same default the create path uses applies.
        const spy = spyRequest();

        await tradeService.modifyPositionTpSl({
            symbol: "BTCUSDT",
            positionId: "pos-1",
            context: CONTEXT,
            stopLoss: { price: new Decimal(55000) },
        });

        expect(sentParams(spy).slStopType).toBe("MARK_PRICE");
        expect("tpPrice" in sentParams(spy)).toBe(false);
    });

    it("refuses to send a modify with no leg at all", async () => {
        const spy = spyRequest();

        await expect(
            tradeService.modifyPositionTpSl({ symbol: "BTCUSDT", positionId: "pos-1" }),
        ).rejects.toThrow("apiErrors.tpslNoLeg");

        expect(spy).not.toHaveBeenCalled();
    });

    it("refuses a carried-over target that sits on the wrong side of entry", async () => {
        // The direction check runs over every leg on the wire, so a stale
        // carried-over level is caught here rather than moving the plan onto
        // a trigger that fires the other way.
        const spy = spyRequest();

        await expect(
            tradeService.modifyPositionTpSl({
                symbol: "BTCUSDT",
                positionId: "pos-1",
                context: CONTEXT,
                takeProfit: { price: new Decimal(55000) },
                stopLoss: { price: new Decimal(55000) },
            }),
        ).rejects.toMatchObject({ refusal: { messageKey: "orderGate.invalidTpSl" } });

        expect(spy).not.toHaveBeenCalled();
    });
});
