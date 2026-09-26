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
 * BUG-0565 — the account snapshot carries its mode.
 *
 * The private WS channels stay subscribed across a mode switch, so a live
 * push arriving while paper mode is on used to overwrite the simulated
 * balance (and book) — whichever writer ran last won regardless of what the
 * trader was trading against. These tests pin the provenance rule: writers
 * stamp, the qualified read trusts only its own mode, and a demoted live
 * measurement keeps its value for display while refusing to be measured
 * against.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { accountState } from "./account.svelte";

function paperBalance() {
    accountState.hydrateBalance({ available: "10000", margin: "0", frozen: "0" }, "paper");
}

function livePush(available: string) {
    accountState.updateBalanceFromWs({ coin: "USDT", available, margin: "0", frozen: "0" });
}

describe("AccountManager snapshot provenance (BUG-0565)", () => {
    beforeEach(() => {
        accountState.reset();
    });

    it("refuses a live wallet push while a paper snapshot is on hand", () => {
        paperBalance();
        livePush("999999");

        expect(accountState.snapshotMode).toBe("paper");
        expect(accountState.readUsdtBalance("paper")?.available.toString()).toBe("10000");
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });

    it("stamps a live push accepted on an empty snapshot", () => {
        livePush("500");

        expect(accountState.snapshotMode).toBe("live");
        expect(accountState.snapshotAt).toEqual(expect.any(Number));
        const reading = accountState.readUsdtBalance("live");
        expect(reading?.available.toString()).toBe("500");
        expect(reading?.at).toBe(accountState.snapshotAt);
        expect(accountState.readUsdtBalance("paper")).toBeUndefined();
    });

    it("reads undefined when nothing was ever written", () => {
        expect(accountState.snapshotMode).toBeUndefined();
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
        expect(accountState.readUsdtBalance("paper")).toBeUndefined();
    });

    it("refuses live position and order pushes while paper is on hand", () => {
        accountState.hydratePositions(
            [
                {
                    symbol: "BTCUSDT",
                    side: "long",
                    size: "1",
                    entryPrice: "50000",
                    leverage: "10",
                    unrealizedPnL: "0",
                    margin: "5000",
                    marginMode: "cross",
                    positionId: "paper-1",
                },
            ],
            "paper",
        );
        accountState.hydrateOpenOrders(
            [
                {
                    id: "paper-o-1",
                    orderId: "paper-o-1",
                    symbol: "BTCUSDT",
                    side: "buy",
                    type: "limit",
                    price: "49000",
                    amount: "1",
                    filled: "0",
                    status: "NEW",
                    time: 1700000000000,
                    fee: "0",
                    realizedPNL: "0",
                },
            ],
            "paper",
        );

        accountState.updatePositionFromWs({
            positionId: "paper-1",
            symbol: "BTCUSDT",
            side: "long",
            qty: "99",
        });
        accountState.updateOrderFromWs({
            orderId: "paper-o-1",
            orderStatus: "FILLED",
        });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe("1");
        expect(accountState.openOrders).toHaveLength(1);
        expect(accountState.openOrders[0].status).toBe("NEW");
    });

    it("demotes a live measurement but keeps the value for display", () => {
        livePush("500");
        accountState.markBalanceUnmeasured();

        // The panel can still show it; the gate must not measure against it.
        expect(accountState.assets.find((a) => a.currency === "USDT")?.available.toString()).toBe(
            "500",
        );
        expect(accountState.snapshotMode).toBeUndefined();
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });

    it("leaves a paper snapshot alone when the socket drops", () => {
        paperBalance();
        accountState.markBalanceUnmeasured();

        expect(accountState.snapshotMode).toBe("paper");
        expect(accountState.readUsdtBalance("paper")?.available.toString()).toBe("10000");
    });

    it("re-stamps on the next live push after a demote", () => {
        livePush("500");
        accountState.markBalanceUnmeasured();
        livePush("480");

        expect(accountState.snapshotMode).toBe("live");
        expect(accountState.readUsdtBalance("live")?.available.toString()).toBe("480");
    });

    it("clears the provenance on reset", () => {
        livePush("500");
        accountState.reset();

        expect(accountState.snapshotMode).toBeUndefined();
        expect(accountState.snapshotAt).toBeUndefined();
        expect(accountState.readUsdtBalance("live")).toBeUndefined();
    });
});
