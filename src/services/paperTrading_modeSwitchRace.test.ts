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
 * BUG-0419 — a read started before a mode switch can still land after it.
 *
 * BUG-0418 clears the state held at the moment of the switch. This is the
 * state that arrives *after* it: an `/api/account` or
 * `/api/leverage-margin-mode` read issued in one mode, still in flight when
 * the trader switches, was applied on arrival because a mode switch did not
 * rotate the session the ordering guard checks. A live value could be written
 * into a paper session — and the reverse on the way back.
 *
 * Each test here holds a response open across `setEnabled()` and asserts the
 * late body does not reach the store. The harness mirrors
 * `PositionsSidebar.race.component.test.ts`: a deferred `appFetch` assigns the
 * value only when the test lets it, so the switch happens while the read is
 * genuinely in flight.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrateAccounts } from "../stores/settings/accounts";

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
    toastService: { error: vi.fn(), success: vi.fn(), add: vi.fn(), warning: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/appAuth", () => ({
    appFetch: appFetchMock,
    appAuthHeaders: () => ({}),
}));

import { tradeService } from "./tradeService";
import { paperTradingService } from "./paperTradingService";
import { accountEpoch } from "./accountEpoch.svelte";
import { paperState } from "../stores/paperTrading.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";

/** A response body parked until the test releases it. */
type Pending = { url: string; resolve: (body: unknown) => void };
let pending: Pending[] = [];

function respond(body: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

/** Answer every request immediately, except `url`, which is held open. */
function hold(url: string): void {
    appFetchMock.mockImplementation((requested: string) => {
        if (String(requested) === url) {
            return new Promise((resolve) => {
                pending.push({ url, resolve: (body) => resolve(respond(body)) });
            });
        }
        return Promise.resolve(respond({}));
    });
}

function release(url: string, body: unknown): void {
    const index = pending.findIndex((p) => p.url === url);
    if (index === -1) throw new Error(`no held request for ${url}`);
    const [held] = pending.splice(index, 1);
    held.resolve(body);
}

beforeEach(() => {
    pending = [];
    appFetchMock.mockReset();
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
});

afterEach(() => {
    paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
});

const leverageBody = (leverage: string, marginMode: string) => ({
    data: { symbol: "BTCUSDT", marginCoin: "USDT", leverage, marginMode },
});

describe("BUG-0419 — a read in flight across a mode switch is discarded", () => {
    it("rotates the session, the same way an account switch does", () => {
        const before = accountEpoch.current();
        paperTradingService.setEnabled(true);
        expect(accountEpoch.isCurrent(before)).toBe(false);
    });

    it("drops a live /api/account response that lands after switching to paper", async () => {
        hold("/api/account");
        const read = tradeService.fetchPositionMode();

        paperTradingService.setEnabled(true);
        // The paper book is hedge-shaped, so "HEDGE" is what the switch just
        // put on screen. A late live "ONE_WAY" must not overwrite it.
        expect(accountState.positionMode).toBe("HEDGE");

        release("/api/account", { data: { positionMode: "ONE_WAY" } });
        await read;

        expect(accountState.positionMode).toBe("HEDGE");
    });

    it("drops a live /api/leverage-margin-mode response that lands after switching to paper", async () => {
        hold("/api/leverage-margin-mode");
        const read = tradeService.fetchLeverageMarginMode("BTCUSDT");

        paperTradingService.setEnabled(true);
        expect(tradeState.remoteLeverage).toBeUndefined();

        release("/api/leverage-margin-mode", leverageBody("20", "ISOLATION"));
        await read;

        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();
        expect(tradeState.remoteAccountStateAt).toBeUndefined();
    });

    it("drops a paper /api/leverage-margin-mode response that lands after switching back to live", async () => {
        paperTradingService.setEnabled(true);
        hold("/api/leverage-margin-mode");
        const read = tradeService.fetchLeverageMarginMode("BTCUSDT");

        paperTradingService.setEnabled(false);

        release("/api/leverage-margin-mode", leverageBody("5", "CROSS"));
        await read;

        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();
    });
});
