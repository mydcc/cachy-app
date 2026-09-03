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
 * FEAT-0026 — "switching clears cached account state rather than blending it".
 *
 * The criterion has two halves and the second one is the one that bites.
 * Clearing is easy to see and easy to test. The in-flight request is neither:
 * a fetch that read account A's credentials, awaited the network, and writes
 * after the switch has nothing in its own code path telling it the ground
 * moved.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { accountSession } from "./accountSession.svelte";
import { accountState } from "../stores/account.svelte";
import { omsService } from "./omsService";
import { tradeState } from "../stores/trade.svelte";
import { paperState } from "../stores/paperTrading.svelte";

beforeEach(() => {
    accountState.reset();
    omsService.reset();
    tradeState.clearRemoteAccountState();
    paperState.setEnabled(false);
});

describe("the session token", () => {
    it("keeps a captured session valid while nothing switches", () => {
        const session = accountSession.current();
        expect(accountSession.isCurrent(session)).toBe(true);
    });

    it("invalidates a captured session on rotation", () => {
        const session = accountSession.current();
        accountSession.rotate("account-switch");
        expect(accountSession.isCurrent(session)).toBe(false);
    });

    it("invalidates every session captured before the rotation, not just the last", () => {
        const first = accountSession.current();
        const second = accountSession.current();
        accountSession.rotate("venue-switch");

        expect(accountSession.isCurrent(first)).toBe(false);
        expect(accountSession.isCurrent(second)).toBe(false);
    });

    it("treats a missing session as not current, so an unguarded caller cannot pass by accident", () => {
        expect(accountSession.isCurrent(null)).toBe(false);
        expect(accountSession.isCurrent(undefined)).toBe(false);
    });
});

describe("reset clears what belongs to the account being left", () => {
    it("drops positions and open orders", () => {
        accountState.positions = [
            { symbol: "BTCUSDT", side: "long" },
        ] as unknown as typeof accountState.positions;
        accountState.openOrders = [
            { orderId: "o-1" },
        ] as unknown as typeof accountState.openOrders;

        accountSession.reset("account-switch");

        expect(accountState.positions).toHaveLength(0);
        expect(accountState.openOrders).toHaveLength(0);
    });

    it("drops the balance, so no merge can blend two accounts' margin fields", () => {
        // `hydrateBalance` preserves isolationMargin/crossMargin/expMoney from
        // the previous asset row — correct within one account, cross-account
        // blending across two. Emptying `assets` is what makes the next
        // hydration a fresh write rather than a merge.
        accountState.hydrateBalance({ available: "100", margin: "10", frozen: "0" });
        expect(accountState.assets).toHaveLength(1);

        accountSession.reset("account-switch");

        expect(accountState.assets).toHaveLength(0);
    });

    /*
     * The safety-critical one. The FEAT-0011 gate reads
     * `remoteAccountStateAt` purely as an age — "is this recent enough to
     * trust" — and never asks which account it describes. Carried across a
     * switch it reads as freshly confirmed while the leverage beside it came
     * from the account the trader just left, and those are the numbers a
     * position size is checked against.
     */
    it("drops the cached leverage and margin mode the order gate ages", () => {
        tradeState.remoteLeverage = new Decimal(20);
        tradeState.remoteMarginMode = "ISOLATED";
        tradeState.remoteAccountStateAt = 1_700_000_000_000;

        accountSession.reset("account-switch");

        expect(tradeState.remoteLeverage).toBeUndefined();
        expect(tradeState.remoteMarginMode).toBeUndefined();
        expect(tradeState.remoteAccountStateAt).toBeUndefined();
    });

    it("drops the cached fees, which are account-scoped and silently misprice", () => {
        tradeState.remoteMakerFee = new Decimal("0.0002");
        tradeState.remoteTakerFee = new Decimal("0.0005");

        accountSession.reset("account-switch");

        expect(tradeState.remoteMakerFee).toBeUndefined();
        expect(tradeState.remoteTakerFee).toBeUndefined();
    });

    it("rotates, so a fetch started before the switch cannot write after it", () => {
        const inFlight = accountSession.current();
        accountSession.reset("account-switch");
        expect(accountSession.isCurrent(inFlight)).toBe(false);
    });

    /*
     * Both halves happen, and a listener woken afterwards sees the new
     * session.
     *
     * Note what this does NOT claim. `reset()` rotates before it clears, but
     * that ordering is defensive rather than load-bearing today:
     * `accountState.notifyListeners()` is debounced, so no listener runs
     * synchronously inside `reset()` and no test can observe the window
     * between the two steps. The ordering is there so that a listener which
     * later becomes synchronous does not silently start discarding its own
     * results.
     */
    it("both rotates and clears, and a listener woken after sees the new session", () => {
        const before = accountSession.seq;
        accountState.positions = [
            { symbol: "BTCUSDT", side: "long" },
        ] as unknown as typeof accountState.positions;

        const seen: number[] = [];
        accountState.registerSyncCallback(() => seen.push(accountSession.seq));

        accountSession.reset("account-switch");
        accountState.requestSync();

        expect(accountSession.seq).toBeGreaterThan(before);
        expect(accountState.positions).toHaveLength(0);
        expect(seen).toEqual([accountSession.seq]);
        accountState.registerSyncCallback(null);
    });
});

describe("paper mode", () => {
    /*
     * `paperTradingService` renders the simulated book *through* the same
     * live stores this clears, so a naive clear blanks the panel a simulated
     * trader is looking at. The paper book is not account-scoped at all.
     */
    it("re-mirrors the simulated book instead of leaving the panel empty", async () => {
        paperState.setEnabled(true);
        accountSession.reset("account-switch");

        // The re-mirror is scheduled through a dynamic import, so it lands on
        // a later microtask than the clear.
        await vi.waitFor(() => {
            expect(accountState.assets.length).toBeGreaterThan(0);
        });
    });

    it("still rotates in paper mode, so a live response cannot land either", () => {
        paperState.setEnabled(true);
        const inFlight = accountSession.current();

        accountSession.reset("account-switch");

        expect(accountSession.isCurrent(inFlight)).toBe(false);
    });
});
