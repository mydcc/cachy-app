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
 * FEAT-0068 — the client half of the account-settings writes.
 *
 * The acceptance criterion these tests exist for is "reflected via
 * WS/refetch, not optimistic-only". So what is asserted is not that the
 * store holds the new value — it is that the store is never written from the
 * *response*, and that a second, independent read (or a resync) is what the
 * displayed state comes from.
 *
 * Paper mode is the other half: `paperExchange` simulates orders and knows
 * nothing about account settings, so there is nothing on the far side to
 * change. Refusing beats pretending.
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
        ...migrateAccounts({ apiKeys: { bitunix: { key: "test-key-1234", secret: "test-secret" } } }),
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
import { tradeState } from "../stores/trade.svelte";
import { accountState } from "../stores/account.svelte";
import { paperState } from "../stores/paperTrading.svelte";

/** Every request the service made, as (url, parsed body) pairs. */
function calls(): Array<{ url: string; body: Record<string, unknown> }> {
    return appFetchMock.mock.calls.map(([url, init]) => ({
        url: String(url),
        body: JSON.parse(String((init as RequestInit)?.body ?? "{}")),
    }));
}

function ok(payload: unknown) {
    return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ code: "0", data: payload }),
        json: async () => ({ code: "0", data: payload }),
    };
}

beforeEach(() => {
    appFetchMock.mockReset();
    appFetchMock.mockResolvedValue(ok({}));
    tradeState.remoteLeverage = undefined;
    tradeState.remoteMarginMode = undefined;
});

afterEach(() => {
    paperState.setEnabled(false);
});

describe("FEAT-0068 — the writes reach the account-settings route", () => {
    it("sends change-leverage with the exchange named in the body", async () => {
        await tradeService.changeLeverage("BTCUSDT", new Decimal(20));

        const [write] = calls();
        expect(write.url).toBe("/api/account-settings");
        expect(write.body).toMatchObject({
            exchange: "bitunix",
            type: "change-leverage",
            symbol: "BTCUSDT",
            leverage: 20,
        });
    });

    it("sends change-margin-mode with the venue's spelling", async () => {
        await tradeService.changeMarginMode("BTCUSDT", "ISOLATION");

        expect(calls()[0].body).toMatchObject({
            type: "change-margin-mode",
            symbol: "BTCUSDT",
            marginMode: "ISOLATION",
        });
    });

    it("sends change-position-mode without a symbol", async () => {
        await tradeService.changePositionMode("HEDGE");

        const { body } = calls()[0];
        expect(body).toMatchObject({ type: "change-position-mode", positionMode: "HEDGE" });
        expect(body.symbol).toBeUndefined();
    });

    it("keeps the sign of a margin withdrawal", async () => {
        await tradeService.adjustPositionMargin({
            symbol: "BTCUSDT",
            amount: new Decimal(-100),
            side: "LONG",
        });

        expect(calls()[0].body).toMatchObject({
            type: "adjust-position-margin",
            amount: "-100",
            side: "LONG",
        });
    });

    it("writes a tiny margin amount in full decimal notation", async () => {
        await tradeService.adjustPositionMargin({
            symbol: "PEPEUSDT",
            amount: new Decimal("0.0000001"),
            positionId: "42",
        });

        // `Decimal.toString()` would emit 1e-7, which exchanges reject.
        expect(calls()[0].body.amount).toBe("0.0000001");
    });
});

describe("FEAT-0068 — displayed state comes from a read, never from the write", () => {
    it("re-reads leverage instead of trusting the response body", async () => {
        appFetchMock.mockImplementation(async (url: string) =>
            url === "/api/account-settings"
                ? ok({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 99 })
                : ok({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 20, marginMode: "ISOLATION" }),
        );

        await tradeService.changeLeverage("BTCUSDT", new Decimal(20));

        const urls = calls().map((c) => c.url);
        expect(urls).toEqual(["/api/account-settings", "/api/leverage-margin-mode"]);
        // 20 from the second read, not the 99 the write echoed back.
        expect(tradeState.remoteLeverage?.toString()).toBe("20");
        expect(tradeState.remoteMarginMode).toBe("ISOLATION");
    });

    it("leaves the displayed leverage alone when the write fails", async () => {
        tradeState.remoteLeverage = new Decimal(5);
        appFetchMock.mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => JSON.stringify({ code: 10001, error: "Position or order exists" }),
        });

        await expect(tradeService.changeLeverage("BTCUSDT", new Decimal(20))).rejects.toThrow();

        expect(tradeState.remoteLeverage.toString()).toBe("5");
        // No refetch either — a failed write must not stamp the state as
        // freshly confirmed.
        expect(calls().map((c) => c.url)).toEqual(["/api/account-settings"]);
    });

    it("asks for a resync after a margin adjustment rather than editing the position", async () => {
        const sync = vi.fn();
        accountState.registerSyncCallback(sync);

        await tradeService.adjustPositionMargin({
            symbol: "BTCUSDT",
            amount: new Decimal(50),
            side: "LONG",
        });

        expect(sync).toHaveBeenCalledTimes(1);
        accountState.registerSyncCallback(null);
    });
});

describe("FEAT-0068 — refusals happen before anything travels", () => {
    it("sends nothing in paper mode", async () => {
        paperState.setEnabled(true);

        await expect(tradeService.changeLeverage("BTCUSDT", new Decimal(20))).rejects.toThrow(
            "exchange.accountSettings.paperMode",
        );
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("refuses a fractional leverage", async () => {
        await expect(
            tradeService.changeLeverage("BTCUSDT", new Decimal("12.5")),
        ).rejects.toThrow();
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("refuses a zero margin adjustment", async () => {
        await expect(
            tradeService.adjustPositionMargin({
                symbol: "BTCUSDT",
                amount: new Decimal(0),
                side: "LONG",
            }),
        ).rejects.toThrow();
        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("refuses a margin adjustment that names no position", async () => {
        await expect(
            tradeService.adjustPositionMargin({ symbol: "BTCUSDT", amount: new Decimal(10) }),
        ).rejects.toThrow();
        expect(appFetchMock).not.toHaveBeenCalled();
    });
});
