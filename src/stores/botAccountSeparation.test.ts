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
 * FEAT-0825 / ADR-0028 — money-path separation between a bot's account and
 * the exchange account on screen.
 *
 * A bot sizes against its own account's equity (the paper book) and reads its
 * own account's positions. Neither the live account's balance nor an exchange
 * account switch may reach either: a bot armed under one account must not
 * drift onto the next one the trader selects.
 */

import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it } from "vitest";

import { accountState } from "./account.svelte";
import { botOrderEnvironment } from "./alerts.svelte";
import { paperState, type PaperPosition } from "./paperTrading.svelte";
import { resetAccountSession } from "../services/accountSession.svelte";

function paperPosition(): PaperPosition {
    return {
        positionId: "paper-pos-1",
        symbol: "BTCUSDT",
        side: "long",
        amount: "0.002",
        entryPrice: "50000",
        leverage: "1",
        marginMode: "isolated",
        realizedPnl: "0",
        openedAt: 0,
        origin: "bot",
        botId: "bot-1",
    };
}

function environment() {
    return botOrderEnvironment(
        () => new Decimal("50000"),
        () => new Decimal("50000"),
    );
}

describe("FEAT-0825 — a bot's money stays on its own account", () => {
    beforeEach(() => {
        paperState.reloadFromStorage();
        paperState.resetBook();
        paperState.setEnabled(true);
        paperState.setBalance(new Decimal("1234.56789"));
        accountState.positions = [];
        accountState.assets = [];
    });

    it("sizes against the paper balance, exactly, whatever the live account holds", () => {
        accountState.assets = [
            {
                currency: "USDT",
                available: new Decimal("99999"),
                margin: new Decimal("0"),
                frozen: new Decimal("0"),
                total: new Decimal("99999"),
            },
        ];

        const equity = environment().equity();
        expect(equity).toBeInstanceOf(Decimal);
        expect(equity.toString()).toBe("1234.56789");
    });

    it("keeps the paper balance and the bot's position through an exchange account switch", () => {
        paperState.setPositions([paperPosition()]);
        const env = environment();

        resetAccountSession("account-switch");

        // The live stores were cleared; the bot's account was not touched.
        expect(env.equity().toString()).toBe("1234.56789");
        expect(paperState.positions.map((p) => p.positionId)).toEqual(["paper-pos-1"]);
        expect(env.hasOpenPosition("BTCUSDT", "long")).toBe(true);
    });

    it("never counts the live account's position as the bot's own reservation", () => {
        // The same symbol and side on two accounts is two reservations: a live
        // long on BTCUSDT does not occupy the bot's paper slot. Paper is off
        // here on purpose — that is when the removed live arm used to answer
        // from this live position, so this case fails against it.
        paperState.setEnabled(false);
        accountState.positions = [
            {
                positionId: "live-1",
                symbol: "BTCUSDT",
                side: "long",
                qty: new Decimal("1"),
                entryPrice: new Decimal("50000"),
                leverage: 1,
                marginMode: "isolated",
                unrealizedPnl: new Decimal("0"),
                realizedPnl: new Decimal("0"),
                liquidationPrice: new Decimal("0"),
                ctime: 0,
                positionMode: "one_way",
            } as unknown as (typeof accountState.positions)[number],
        ];

        expect(environment().hasOpenPosition("BTCUSDT", "long")).toBe(false);
    });
});
