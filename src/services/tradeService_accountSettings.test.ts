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

const toastMock = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    add: vi.fn(),
}));
vi.mock("./toastService.svelte", () => ({ toastService: toastMock }));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { tradeState } from "../stores/trade.svelte";
import { accountState } from "../stores/account.svelte";
import { accountSession } from "./accountSession.svelte";
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
    toastMock.warning.mockClear();
    toastMock.error.mockClear();
    toastMock.success.mockClear();
    tradeState.remoteLeverage = undefined;
    tradeState.remoteMarginMode = undefined;
    accountState.setPositionMode(undefined);
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

describe("BUG-1b — position mode has its own read", () => {
    it("reads the account snapshot and stores the position mode", async () => {
        appFetchMock.mockResolvedValue(ok({ positionMode: "HEDGE" }));
        accountState.setPositionMode(undefined);

        await tradeService.fetchPositionMode();

        expect(calls().map((c) => c.url)).toEqual(["/api/account"]);
        expect(calls()[0].body).toEqual({ exchange: "bitunix" });
        expect(accountState.positionMode).toBe("HEDGE");
    });

    it("clears a mode the venue no longer reports", async () => {
        appFetchMock.mockResolvedValue(ok({}));
        accountState.setPositionMode("ONE_WAY");

        await tradeService.fetchPositionMode();

        expect(accountState.positionMode).toBeUndefined();
    });

    it("leaves the displayed mode alone when the read fails", async () => {
        appFetchMock.mockRejectedValue(new Error("offline"));
        accountState.setPositionMode("ONE_WAY");

        await tradeService.fetchPositionMode();

        expect(accountState.positionMode).toBe("ONE_WAY");
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

/*
 * BUG-0410 — the mode chip must not depend on PositionsSidebar being mounted.
 *
 * `accountState.requestSync()` fires a callback that only `PositionsSidebar`
 * registers. Hiding the sidebar is a display preference; it used to also mean
 * that a confirmed position-mode change never reached the chip, because the
 * write's only refresh was that no-op. The service now takes its own read, so
 * these tests deliberately register no sync callback at all.
 */
describe("BUG-0410 — the position-mode write refreshes without a sidebar", () => {
    beforeEach(() => {
        accountState.registerSyncCallback(null);
    });

    it("reads the account back with no sync callback registered", async () => {
        appFetchMock.mockResolvedValue(ok({ positionMode: "HEDGE" }));

        await tradeService.changePositionMode("HEDGE");

        expect(calls().map((c) => c.url)).toEqual([
            "/api/account-settings",
            "/api/account",
        ]);
        expect(accountState.positionMode).toBe("HEDGE");
    });

    it("shows what the venue reports, not what was requested", async () => {
        // The exchange accepted the write but still answers ONE_WAY — an
        // eventual-consistency window, not a client bug. What must never
        // happen is the chip echoing the request as if it were confirmed.
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/account"
                ? ok({ positionMode: "ONE_WAY" })
                : ok({}),
        );

        await runWithReadBack(tradeService.changePositionMode("HEDGE"));

        expect(accountState.positionMode).toBe("ONE_WAY");
    });

    it("still resyncs the sidebar when one is mounted", async () => {
        const sync = vi.fn();
        accountState.registerSyncCallback(sync);
        appFetchMock.mockResolvedValue(ok({ positionMode: "HEDGE" }));

        await tradeService.changePositionMode("HEDGE");

        expect(sync).toHaveBeenCalledTimes(1);
        accountState.registerSyncCallback(null);
    });

    it("leaves the displayed mode alone when the read-back fails", async () => {
        accountState.setPositionMode("ONE_WAY");
        appFetchMock.mockImplementation(async (url: string) => {
            if (String(url) === "/api/account") throw new Error("offline");
            return ok({});
        });

        // The write itself succeeded, so this must not reject — the silent
        // read contract applies to the read half only.
        await runWithReadBack(tradeService.changePositionMode("HEDGE"));

        expect(accountState.positionMode).toBe("ONE_WAY");
    });
});

/**
 * Drive a call whose post-write read-back sleeps between attempts.
 *
 * The delays are deliberately long enough for a trader to notice
 * (`READ_BACK_DELAYS_MS`), so real timers would make these tests take
 * seconds. Fake timers advance past every attempt and flush the awaits in
 * between; the returned promise is settled by the time this resolves.
 */
async function runWithReadBack<T>(pending: Promise<T>): Promise<T> {
    vi.useFakeTimers();
    try {
        const settled = pending.then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error }),
        );
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await settled;
        if (!result.ok) throw result.error;
        return result.value;
    } finally {
        vi.useRealTimers();
    }
}

/*
 * BUG-0409 — a confirmed write must reach the chip without a reload.
 *
 * The write returning 200 is not the same as the change being readable: a
 * live capture showed `/api/account` still answering HEDGE seconds after a
 * confirmed ONE_WAY write, with the broker app already showing ONE_WAY. A
 * single immediate re-read lands inside that window and the chip then froze
 * on the old value with nothing to distinguish a slow exchange from a broken
 * client.
 */
describe("BUG-0409 — the read-back is bounded and honest", () => {
    beforeEach(() => {
        accountState.registerSyncCallback(null);
    });

    it("retries until the venue reports the written position mode", async () => {
        let reads = 0;
        appFetchMock.mockImplementation(async (url: string) => {
            if (String(url) !== "/api/account") return ok({});
            reads += 1;
            // First answer is inside the venue's propagation window.
            return ok({ positionMode: reads === 1 ? "ONE_WAY" : "HEDGE" });
        });

        await runWithReadBack(tradeService.changePositionMode("HEDGE"));

        expect(reads).toBe(2);
        expect(accountState.positionMode).toBe("HEDGE");
        expect(toastMock.warning).not.toHaveBeenCalled();
    });

    it("stops after a bounded number of attempts", async () => {
        let reads = 0;
        appFetchMock.mockImplementation(async (url: string) => {
            if (String(url) !== "/api/account") return ok({});
            reads += 1;
            return ok({ positionMode: "ONE_WAY" });
        });

        await runWithReadBack(tradeService.changePositionMode("HEDGE"));

        // Bounded, not a poller: it gives up rather than hammering the venue.
        expect(reads).toBe(3);
    });

    it("says so when the venue never confirms", async () => {
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/account" ? ok({ positionMode: "ONE_WAY" }) : ok({}),
        );

        await runWithReadBack(tradeService.changePositionMode("HEDGE"));

        // The alternative this replaces was a logger line nobody sees.
        expect(toastMock.warning).toHaveBeenCalledTimes(1);
    });

    it("clears the verifying marker whether or not the venue confirms", async () => {
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/account" ? ok({ positionMode: "ONE_WAY" }) : ok({}),
        );

        await runWithReadBack(tradeService.changePositionMode("HEDGE"));
        expect(accountState.positionModeVerifying).toBe(false);

        appFetchMock.mockResolvedValue(ok({ positionMode: "HEDGE" }));
        await runWithReadBack(tradeService.changePositionMode("HEDGE"));
        expect(accountState.positionModeVerifying).toBe(false);
    });

    it("raises the marker while the read-back is still running", async () => {
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/account" ? ok({ positionMode: "ONE_WAY" }) : ok({}),
        );

        vi.useFakeTimers();
        try {
            const pending = tradeService.changePositionMode("HEDGE").catch(() => {});
            // Past the write and the first read, inside the first gap.
            await vi.advanceTimersByTimeAsync(100);
            expect(accountState.positionModeVerifying).toBe(true);
            await vi.advanceTimersByTimeAsync(10_000);
            await pending;
        } finally {
            vi.useRealTimers();
        }
    });

    it("accepts any spelling the venue uses for the margin mode", async () => {
        // Bitunix answers ISOLATION, the mappers lowercase, Bitget would say
        // "isolated". A confirmed write must not look unconfirmed because of
        // spelling.
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/leverage-margin-mode"
                ? ok({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: "20", marginMode: "isolated" })
                : ok({}),
        );

        await runWithReadBack(tradeService.changeMarginMode("BTCUSDT", "ISOLATION"));

        expect(toastMock.warning).not.toHaveBeenCalled();
        expect(accountState.marginModeVerifying).toBe(false);
    });

    it("warns when the margin mode never comes back changed", async () => {
        appFetchMock.mockImplementation(async (url: string) =>
            String(url) === "/api/leverage-margin-mode"
                ? ok({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 20, marginMode: "CROSS" })
                : ok({}),
        );

        await runWithReadBack(tradeService.changeMarginMode("BTCUSDT", "ISOLATION"));

        expect(toastMock.warning).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the account is switched mid-read-back", async () => {
        let rotated = false;
        appFetchMock.mockImplementation(async (url: string) => {
            if (String(url) === "/api/leverage-margin-mode" && !rotated) {
                rotated = true;
                // The switch lands between the ticket and the answer: the
                // body is fresh but belongs to no session the read-back
                // tracks, so it is dropped instead of warned about.
                accountSession.rotate("account-switch");
            }
            return String(url) === "/api/leverage-margin-mode"
                ? ok({ symbol: "BTCUSDT", marginCoin: "USDT", leverage: 20, marginMode: "CROSS" })
                : ok({});
        });

        await runWithReadBack(tradeService.changeMarginMode("BTCUSDT", "ISOLATION"));

        expect(toastMock.warning).not.toHaveBeenCalled();
        expect(tradeState.remoteMarginMode).toBeUndefined();
    });
});
