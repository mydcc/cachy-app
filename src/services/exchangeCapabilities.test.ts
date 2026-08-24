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
 * FEAT-0017 — the capability model's own guarantees.
 *
 * Three properties are load-bearing and none of them is obvious from reading
 * one file: venue declarations are isolated from one another, the adapter and
 * the aggregator answer identically, and an undeclared venue can do nothing.
 */

import { describe, it, expect } from "vitest";
import {
    capabilitiesOf,
    isKnownExchange,
    supportsOrderType,
    supportsTimeInForce,
    supportsMarginMode,
    supportsPositionMode,
    unsupportedReasonKey,
    unsupportedTimeInForceReasonKey,
    UNKNOWN_EXCHANGE,
} from "./exchangeCapabilities";
import { bitunixCapabilities } from "./exchange/bitunixCapabilities";
import { bitgetCapabilities } from "./exchange/bitgetCapabilities";
import { bitunixAdapter } from "./exchange/bitunixAdapter";
import { bitgetAdapter } from "./exchange/bitgetAdapter";

describe("exchange capabilities (FEAT-0017)", () => {
    describe("per-venue isolation", () => {
        /*
         * The acceptance criterion "adding a capability to one adapter changes
         * no other adapter". Shared array instances are how that breaks in
         * practice: two venues pointing at one `orderTypes` array means a
         * push on either widens both.
         */
        it("gives each venue its own declaration object", () => {
            expect(bitunixCapabilities).not.toBe(bitgetCapabilities);
        });

        it("shares no array instance between venues", () => {
            expect(bitunixCapabilities.orderTypes).not.toBe(bitgetCapabilities.orderTypes);
            expect(bitunixCapabilities.timeInForce).not.toBe(bitgetCapabilities.timeInForce);
            expect(bitunixCapabilities.marginModes).not.toBe(bitgetCapabilities.marginModes);
            expect(bitunixCapabilities.positionModes).not.toBe(bitgetCapabilities.positionModes);
        });

        it("freezes declarations so a consumer cannot widen a venue at runtime", () => {
            expect(Object.isFrozen(bitunixCapabilities)).toBe(true);
            expect(Object.isFrozen(bitgetCapabilities)).toBe(true);
            expect(Object.isFrozen(bitunixCapabilities.orderTypes)).toBe(true);
            expect(Object.isFrozen(bitgetCapabilities.timeInForce)).toBe(true);
        });

        it("keeps venues genuinely different, so the tests below cannot pass vacuously", () => {
            expect(bitunixCapabilities.tpSlAtEntry).toBe(true);
            expect(bitgetCapabilities.tpSlAtEntry).toBe(false);
        });
    });

    describe("adapter and aggregator agree", () => {
        /*
         * Two paths reach the same fact: `activeExchange().capabilities` for
         * the UI, `capabilitiesOf(id)` for `orderGate`, which must not import
         * the adapter graph. If they ever disagreed, the gate would refuse
         * what the UI offered — or worse, allow what it hid.
         */
        it("serves the identical declaration through both paths", () => {
            expect(bitunixAdapter.capabilities).toBe(capabilitiesOf("bitunix"));
            expect(bitgetAdapter.capabilities).toBe(capabilitiesOf("bitget"));
        });

        it("hands the venue's own module through untouched", () => {
            expect(bitunixAdapter.capabilities).toBe(bitunixCapabilities);
            expect(bitgetAdapter.capabilities).toBe(bitgetCapabilities);
        });
    });

    describe("an undeclared venue", () => {
        it("is not known", () => {
            expect(isKnownExchange("bitunix")).toBe(true);
            expect(isKnownExchange("bitget")).toBe(true);
            expect(isKnownExchange("kraken")).toBe(false);
        });

        it("can do nothing at all, rather than defaulting to something", () => {
            const caps = capabilitiesOf("kraken");
            expect(caps).toBe(UNKNOWN_EXCHANGE);
            expect(caps.orderTypes).toEqual([]);
            expect(caps.timeInForce).toEqual([]);
            expect(caps.marginModes).toEqual([]);
            expect(caps.positionModes).toEqual([]);
            expect(caps.tpSlAtEntry).toBe(false);
            expect(caps.multipleTakeProfits).toBe(false);
            expect(caps.trailingStop).toBe(false);
        });

        /*
         * `capabilitiesOf` reads a plain object, so an id colliding with
         * something on Object.prototype must not resolve to a function.
         */
        it("does not resolve a prototype key as a venue", () => {
            expect(capabilitiesOf("constructor")).toBe(UNKNOWN_EXCHANGE);
            expect(capabilitiesOf("toString")).toBe(UNKNOWN_EXCHANGE);
            expect(isKnownExchange("constructor")).toBe(false);
        });
    });

    describe("order types", () => {
        it("allows market and limit on both venues", () => {
            for (const venue of ["bitunix", "bitget"]) {
                expect(supportsOrderType(venue, "market")).toBe(true);
                expect(supportsOrderType(venue, "limit")).toBe(true);
            }
        });

        it("refuses trigger everywhere, since no venue has a verified shape for it", () => {
            expect(supportsOrderType("bitunix", "trigger")).toBe(false);
            expect(supportsOrderType("bitget", "trigger")).toBe(false);
        });

        it("refuses everything on an undeclared venue", () => {
            expect(supportsOrderType("kraken", "market")).toBe(false);
        });
    });

    describe("time in force", () => {
        it("accepts Bitunix's four values", () => {
            for (const tif of ["GTC", "IOC", "FOK", "POST_ONLY"] as const) {
                expect(supportsTimeInForce("bitunix", tif)).toBe(true);
            }
        });

        it("accepts none on Bitget, which declares an empty list", () => {
            for (const tif of ["GTC", "IOC", "FOK", "POST_ONLY"] as const) {
                expect(supportsTimeInForce("bitget", tif)).toBe(false);
            }
        });
    });

    describe("margin and position modes", () => {
        it("reports both margin modes where the positions route normalises both", () => {
            expect(supportsMarginMode("bitunix", "cross")).toBe(true);
            expect(supportsMarginMode("bitunix", "isolated")).toBe(true);
            expect(supportsMarginMode("bitget", "cross")).toBe(true);
            expect(supportsMarginMode("bitget", "isolated")).toBe(true);
        });

        it("reports hedge only where a position mode is actually observed", () => {
            expect(supportsPositionMode("bitunix", "hedge")).toBe(true);
            expect(supportsPositionMode("bitunix", "one_way")).toBe(true);
            // Bitget sends no position mode Cachy reads; unknown stays unoffered.
            expect(supportsPositionMode("bitget", "hedge")).toBe(false);
            expect(supportsPositionMode("bitget", "one_way")).toBe(false);
        });
    });

    describe("reason keys", () => {
        it("names the unknown venue rather than blaming the order type", () => {
            expect(unsupportedReasonKey("kraken", "limit")).toBe(
                "orderEntry.unsupported.unknownExchange",
            );
            expect(unsupportedTimeInForceReasonKey("kraken")).toBe(
                "orderEntry.unsupported.unknownExchange",
            );
        });

        it("distinguishes trigger from a generic refusal", () => {
            expect(unsupportedReasonKey("bitunix", "trigger")).toBe(
                "orderEntry.unsupported.trigger",
            );
            expect(unsupportedReasonKey("bitunix", "limit")).toBe(
                "orderEntry.unsupported.generic",
            );
        });

        it("gives the time-in-force refusal its own key, since the remedy differs", () => {
            expect(unsupportedTimeInForceReasonKey("bitget")).toBe(
                "orderEntry.unsupported.timeInForce",
            );
        });
    });
});
