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
 * FEAT-0488 — which position book `hasOpenPosition` reads.
 *
 * The exposure guard's correctness rests on that choice and nothing else: a
 * reader that remembered what *this rule* opened instead of asking the book
 * would pass every service-level test and reintroduce stacking onto a position
 * the trader opened by hand. So the branch is pinned here, where the stores
 * are reachable.
 *
 * The discriminating case is the last one in each block: a position present in
 * the book that is *not* the one being read must not count. Without it, a
 * reader that consulted both books would pass every case above.
 */

import { Decimal } from "decimal.js";
import { beforeEach, describe, expect, it } from "vitest";

import { accountState } from "./account.svelte";
import { botOrderEnvironment } from "./alerts.svelte";
import { paperState, type PaperPosition } from "./paperTrading.svelte";

/** Only the three fields the predicate reads; the rest is fill. */
function paperPosition(symbol: string, side: "long" | "short"): PaperPosition {
    return {
        positionId: "p1",
        symbol,
        side,
        amount: "0.002",
        entryPrice: "50000",
        leverage: "1",
        marginMode: "isolated",
        realizedPnl: "0",
        openedAt: 0,
    };
}

/** The live store's `Position` is structurally wider; only three fields matter. */
function accountPosition(symbol: string, side: "long" | "short") {
    return {
        positionId: "a1",
        symbol,
        side,
        qty: new Decimal("0.002"),
        entryPrice: new Decimal("50000"),
        leverage: 1,
        marginMode: "isolated" as const,
        unrealizedPnl: new Decimal("0"),
        realizedPnl: new Decimal("0"),
        liquidationPrice: new Decimal("0"),
        ctime: 0,
        positionMode: "one_way" as const,
    };
}

function environment() {
    return botOrderEnvironment(
        () => new Decimal("50000"),
        () => new Decimal("50000"),
    );
}

describe("hasOpenPosition", () => {
    beforeEach(() => {
        paperState.reloadFromStorage();
        paperState.resetBook();
        paperState.setEnabled(false);
        accountState.positions = [];
    });

    it("answers for the paper book while paper trading is on", () => {
        paperState.setEnabled(true);
        paperState.setPositions([paperPosition("BTCUSDT", "long")]);
        accountState.positions = [];

        const env = environment();
        expect(env.hasOpenPosition("BTCUSDT", "long")).toBe(true);
        expect(env.hasOpenPosition("BTCUSDT", "short")).toBe(false);
        expect(env.hasOpenPosition("ETHUSDT", "long")).toBe(false);
    });

    it("never reads the live account's book, even while paper trading is off", () => {
        // FEAT-0825 / ADR-0028 — the discriminating case. A bot's account is
        // the paper account, so a live position on the same slot is another
        // account's reservation, not this bot's. The old live arm answered
        // `true` here; it was unreachable (the lane refuses first) and is
        // gone, so a branch that reads the wrong account cannot come back
        // unnoticed.
        paperState.setEnabled(false);
        paperState.setPositions([]);
        accountState.positions = [accountPosition("BTCUSDT", "long")];

        expect(environment().hasOpenPosition("BTCUSDT", "long")).toBe(false);
    });

    it("keeps answering for the paper book while paper trading is off", () => {
        // The bot's own book does not stop existing when its account stops
        // executing; the lane's `paper-trading-off` refusal is what stops
        // the entry, not a guard that pretends the slot is empty.
        paperState.setEnabled(false);
        paperState.setPositions([paperPosition("BTCUSDT", "long")]);
        accountState.positions = [];

        expect(environment().hasOpenPosition("BTCUSDT", "long")).toBe(true);
    });

    it("ignores the live book entirely while paper trading is on", () => {
        paperState.setEnabled(true);
        paperState.setPositions([]);
        accountState.positions = [accountPosition("BTCUSDT", "long")];

        expect(environment().hasOpenPosition("BTCUSDT", "long")).toBe(false);
    });

    it("is false for an empty book rather than throwing", () => {
        // Fail-open by design: this is a limit, not an interlock, and refusing
        // whenever the book is momentarily empty would silently disable every
        // bot. The interlock is `origin: "bot"` in `OrderGate`, downstream and
        // unchanged.
        paperState.setEnabled(true);
        paperState.setPositions([]);

        expect(environment().hasOpenPosition("BTCUSDT", "long")).toBe(false);
    });
});