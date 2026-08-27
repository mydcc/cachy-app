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
 * FEAT-0227 — the one place subscriptions are counted.
 *
 * The behaviour these pin down is the behaviour that used to be spread across
 * two WebSocket services and read from a third file: subscribe once for many
 * wanters, unsubscribe when the last one goes, and re-issue everything after
 * the socket was torn down.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SubscriptionLedger, subscriptionKey } from "./subscriptionLedger";

const t = (symbol: string, channel: string) => ({ symbol, channel });

describe("SubscriptionLedger", () => {
    let ledger: SubscriptionLedger;

    beforeEach(() => {
        ledger = new SubscriptionLedger();
    });

    it("subscribes a newly wanted channel exactly once", () => {
        const delta = ledger.reconcile([t("BTCUSDT", "ticker")]);

        expect(delta.subscribe).toEqual([t("BTCUSDT", "ticker")]);
        expect(delta.unsubscribe).toEqual([]);
    });

    it("does not re-subscribe a channel already issued", () => {
        ledger.reconcile([t("BTCUSDT", "ticker")]);
        const delta = ledger.reconcile([t("BTCUSDT", "ticker")]);

        expect(delta.subscribe).toEqual([]);
        expect(delta.unsubscribe).toEqual([]);
    });

    it("counts every wanter but subscribes once", () => {
        // Two requirements expanding onto the same venue channel.
        const delta = ledger.reconcile([t("BTCUSDT", "ticker"), t("BTCUSDT", "ticker")]);

        expect(delta.subscribe).toEqual([t("BTCUSDT", "ticker")]);
        expect(ledger.count("BTCUSDT", "ticker")).toBe(2);
    });

    it("keeps the subscription while one wanter remains", () => {
        ledger.reconcile([t("BTCUSDT", "ticker"), t("BTCUSDT", "ticker")]);
        const delta = ledger.reconcile([t("BTCUSDT", "ticker")]);

        expect(delta.unsubscribe).toEqual([]);
        expect(ledger.isIssued("BTCUSDT", "ticker")).toBe(true);
        expect(ledger.count("BTCUSDT", "ticker")).toBe(1);
    });

    it("unsubscribes when the last wanter goes", () => {
        ledger.reconcile([t("BTCUSDT", "ticker")]);
        const delta = ledger.reconcile([]);

        expect(delta.unsubscribe).toEqual([t("BTCUSDT", "ticker")]);
        expect(ledger.isIssued("BTCUSDT", "ticker")).toBe(false);
        expect(ledger.count("BTCUSDT", "ticker")).toBe(0);
    });

    it("re-issues everything wanted after the socket was torn down", () => {
        ledger.reconcile([t("BTCUSDT", "ticker"), t("ETHUSDT", "kline_1h")]);

        // A provider destroy()/connect() cycle: the socket forgot, the
        // consumers did not.
        ledger.forgetIssued();
        const delta = ledger.reconcile([t("BTCUSDT", "ticker"), t("ETHUSDT", "kline_1h")]);

        expect(delta.subscribe).toHaveLength(2);
        expect(delta.subscribe).toEqual(
            expect.arrayContaining([t("BTCUSDT", "ticker"), t("ETHUSDT", "kline_1h")]),
        );
        // Nothing to unsubscribe: the socket already holds nothing.
        expect(delta.unsubscribe).toEqual([]);
    });

    it("drops a channel nothing wants any more even across a teardown", () => {
        ledger.reconcile([t("STALEUSDT", "price")]);
        ledger.forgetIssued();

        const delta = ledger.reconcile([]);

        // Already forgotten, so there is nothing to tell the socket — sending
        // an unsubscribe for a channel it does not hold would be noise.
        expect(delta.unsubscribe).toEqual([]);
        expect(ledger.count("STALEUSDT", "price")).toBe(0);
    });

    it("swaps one symbol for another in a single reconcile", () => {
        ledger.reconcile([t("BTCUSDT", "ticker")]);
        const delta = ledger.reconcile([t("ETHUSDT", "ticker")]);

        expect(delta.unsubscribe).toEqual([t("BTCUSDT", "ticker")]);
        expect(delta.subscribe).toEqual([t("ETHUSDT", "ticker")]);
    });

    it("splits a key back into the symbol it came from", () => {
        // Symbols are not guaranteed to be colon-free; channels are.
        ledger.reconcile([t("BTC:PERP", "ticker")]);
        expect(ledger.issuedTargets()).toEqual([t("BTC:PERP", "ticker")]);
    });

    it("keys the way both venues already did", () => {
        expect(subscriptionKey("BTCUSDT", "ticker")).toBe("ticker:BTCUSDT");
    });

    it("clears both what is wanted and what was issued", () => {
        ledger.reconcile([t("BTCUSDT", "ticker")]);
        ledger.clear();

        expect(ledger.wantedSize).toBe(0);
        expect(ledger.issuedSize).toBe(0);
    });
});
