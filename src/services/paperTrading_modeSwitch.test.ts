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
 * Switching between paper and live is an account switch in every way that
 * matters: a different book, different leverage, different fees.
 *
 * `accountSession.reset()` — the path a real account switch takes — clears
 * both halves of the remote account state. `paperTradingService.setEnabled()`
 * cleared only `accountState`, so the values `tradeState` holds survived the
 * switch: leverage, margin mode, and the maker/taker fees a position size is
 * priced with. `clearRemoteAccountState()` calls those "the safety-critical
 * half" for exactly this reason.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";
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

vi.mock("../lib/appAuth", () => ({ appFetch: vi.fn(), appAuthHeaders: () => ({}) }));

import { paperTradingService } from "./paperTradingService";
import { paperState } from "../stores/paperTrading.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";

/** The state a live session leaves behind, as a real read would have set it. */
function seedLiveRemoteState() {
    tradeState.remoteLeverage = new Decimal(20);
    tradeState.remoteMarginMode = "ISOLATION";
    tradeState.remoteMakerFee = new Decimal("0.0002");
    tradeState.remoteTakerFee = new Decimal("0.0006");
    tradeState.remoteAccountStateAt = Date.now();
    accountState.setPositionMode("HEDGE");
}

beforeEach(() => {
    localStorage.clear();
    paperState.reloadFromStorage();
    paperState.resetBook();
    if (paperState.enabled) paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
});

describe("switching into paper mode discards the live account's numbers", () => {
    it("clears the leverage a position size is calculated against", () => {
        seedLiveRemoteState();
        paperTradingService.setEnabled(true);
        expect(tradeState.remoteLeverage).toBeUndefined();
    });

    it("clears the maker and taker fees", () => {
        seedLiveRemoteState();
        paperTradingService.setEnabled(true);
        expect(tradeState.remoteMakerFee).toBeUndefined();
        expect(tradeState.remoteTakerFee).toBeUndefined();
    });

    it("clears the margin mode and its freshness stamp together", () => {
        seedLiveRemoteState();
        paperTradingService.setEnabled(true);
        expect(tradeState.remoteMarginMode).toBeUndefined();
        expect(tradeState.remoteAccountStateAt).toBeUndefined();
    });
});

describe("switching back out of paper mode discards the simulated numbers", () => {
    it("does not carry the paper session's remote state into live", () => {
        paperTradingService.setEnabled(true);
        tradeState.remoteLeverage = new Decimal(5);
        tradeState.remoteMarginMode = "CROSS";
        tradeState.remoteAccountStateAt = Date.now();

        paperTradingService.setEnabled(false);

        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();
        expect(tradeState.remoteAccountStateAt).toBeUndefined();
    });
});
