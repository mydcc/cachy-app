/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * Flash close meets the confirmation policy — FEAT-0330.
 *
 * `orderGate.confirmation.test.ts` proves the gate refuses an unconfirmed
 * action. This proves the other half: that `flashClosePosition` actually
 * carries the dialog's timestamp that far, rather than dropping it somewhere
 * between the button and the intent.
 *
 * The distinction matters because dropping it fails safe and therefore
 * silently — the order simply never sends, and a trader who pressed the panic
 * button would be left holding a position they believe they closed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../services/omsService", () => ({
    omsService: {
        getPositions: vi.fn(() => []),
        updatePosition: vi.fn(),
        updateOrder: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        getAllOrders: vi.fn(() => []),
    },
}));

vi.mock("../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../stores/settings.svelte", () => ({
    settingsState: {
        isPro: true,
        apiProvider: "bitunix",
        capabilities: { tradeExecution: true, proLicense: true },
        apiKeys: {
            bitunix: { key: "test-public-key", secret: "test-secret-key" },
            bitget: { key: "", secret: "", passphrase: "" },
        },
    },
}));

vi.mock("../stores/market.svelte", () => ({
    marketState: { data: { BTCUSDT: { lastPrice: new Decimal("50000") } } },
}));

vi.mock("../services/rmsService", () => ({
    rmsService: { validateTrade: vi.fn(() => ({ allowed: true, reason: "OK" })) },
}));

vi.mock("../services/toastService.svelte", () => ({
    toastService: { error: vi.fn(), add: vi.fn() },
}));

import { tradeService } from "../services/tradeService";
import { omsService } from "../services/omsService";
import { registerConfirmationCheck, registerKillSwitch } from "../services/orderGate";

/** Requires a confirmation for flash close and nothing else. */
const flashCloseNeedsConfirming = (action: string) => action === "flash-close-position";

beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ code: 0, data: [] })),
    } as unknown as Response);

    vi.mocked(omsService.getPositions).mockReturnValue([
        {
            symbol: "BTCUSDT",
            side: "long",
            amount: new Decimal("12.345"),
            entryPrice: new Decimal("50000"),
            markPrice: new Decimal("50100"),
            leverage: new Decimal("10"),
            liquidationPrice: new Decimal("45000"),
            unrealizedPnl: new Decimal("0"),
            margin: new Decimal("500"),
            positionId: "pos-1",
            marginMode: "isolated",
        },
    ] as ReturnType<typeof omsService.getPositions>);
});

afterEach(() => {
    registerConfirmationCheck(null);
    registerKillSwitch(null);
    vi.clearAllMocks();
});

/** Every /api/orders call the transport actually made. */
function orderCalls(): unknown[][] {
    return vi.mocked(global.fetch).mock.calls.filter(([url]) =>
        String(url).includes("/api/orders"),
    );
}

/** The cancel-all the function fires before closing, if it fired. */
function cancelCalls(): unknown[][] {
    return orderCalls().filter(([, init]) => {
        const body = (init as RequestInit | undefined)?.body;
        return typeof body === "string" && body.includes("cancel-all");
    });
}

describe("flash close under the confirmation policy", () => {
    it("refuses without a confirmation when the policy wants one", async () => {
        registerConfirmationCheck(flashCloseNeedsConfirming);

        const result = await tradeService.flashClosePosition("BTCUSDT", "long");

        expect(result.success).toBe(false);
    });

    it("sends nothing at all when it refuses", async () => {
        // The gate throws before the transport is invoked. A cancelled request
        // would still be a request; this asserts the order never left.
        registerConfirmationCheck(flashCloseNeedsConfirming);

        await tradeService.flashClosePosition("BTCUSDT", "long");

        expect(orderCalls()).toHaveLength(0);
    });

    it("sends once the dialog's timestamp is passed through", async () => {
        registerConfirmationCheck(flashCloseNeedsConfirming);

        const result = await tradeService.flashClosePosition("BTCUSDT", "long", Date.now());

        expect(result.success).toBe(true);
    });

    it("sends without a timestamp when the policy does not want one", async () => {
        // The user switched the confirmation off. No dialog, no `confirmedAt`,
        // and the gate must not invent a requirement the user declined.
        registerConfirmationCheck(() => false);

        const result = await tradeService.flashClosePosition("BTCUSDT", "long");

        expect(result.success).toBe(true);
    });
});

describe("a refused flash close leaves the position's protection alone (BUG-0331)", () => {
    /*
     * The function cancels this position's stop-loss and take-profit before
     * closing. That is right when the close then happens and dangerous when it
     * does not: a refusal afterwards leaves the trader in a live position with
     * no protection, at the moment they were trying to get out.
     *
     * The confirmation is only one of the refusals that used to arrive too
     * late. These cover the others.
     */

    it("cancels nothing when the kill switch refuses the close", () => {
        registerKillSwitch(() => true);

        return tradeService.flashClosePosition("BTCUSDT", "long", Date.now()).then((result) => {
            expect(result.success).toBe(false);
            expect(cancelCalls()).toHaveLength(0);
        });
    });

    it("cancels nothing when the confirmation is missing", async () => {
        registerConfirmationCheck(flashCloseNeedsConfirming);

        await tradeService.flashClosePosition("BTCUSDT", "long");

        expect(cancelCalls()).toHaveLength(0);
    });

    it("still cancels on the way to a close that is going through", async () => {
        // The hardening itself must survive the fix: a resting stop can fight
        // a market close, so an approved close still clears them first.
        const result = await tradeService.flashClosePosition("BTCUSDT", "long", Date.now());

        expect(result.success).toBe(true);
        expect(cancelCalls().length).toBeGreaterThan(0);
    });
});
