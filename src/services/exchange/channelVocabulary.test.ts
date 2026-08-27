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
 * FEAT-0227 — the requirement → channel mapping, tested where it now lives.
 *
 * It used to be one table in `types/dataRequirements.ts` spelled Bitunix's
 * way, with tests that compared the function to the table it read from and so
 * could not catch a wrong name. These run against every registered adapter,
 * which is the property that matters: a venue that answers to `books5` must
 * not be handed `depth_book5`.
 */

import { describe, it, expect } from "vitest";
import { exchangeAdapters, getExchangeAdapter } from "./index";

/*
 * Public channels only. `positions` and `orders` are private on both venues
 * and each service subscribes to them itself after login, so an adapter that
 * mapped them would put a second subscription over the top of one that is
 * already live — see the note in each adapter's CHANNELS table.
 */
const REQUIREMENTS_EVERY_VENUE_MUST_HAVE = ["ticker", "depth"];

/** Private everywhere: driven by each service's own login, never the registry. */
const PRIVATE_REQUIREMENTS = ["positions", "orders"];

describe("channelsForRequirement — every adapter", () => {
    for (const adapter of exchangeAdapters) {
        describe(adapter.id, () => {
            const channelsFor = (requirement: string) =>
                adapter.marketData.channelsForRequirement(requirement);

            it("resolves the requirements every venue is expected to carry", () => {
                for (const requirement of REQUIREMENTS_EVERY_VENUE_MUST_HAVE) {
                    expect(
                        channelsFor(requirement),
                        `${adapter.id} cannot resolve '${requirement}'`,
                    ).not.toHaveLength(0);
                }
            });

            it("passes a kline requirement through with its timeframe intact", () => {
                expect(channelsFor("kline_1m")).toEqual(["kline_1m"]);
                expect(channelsFor("kline_1h")).toEqual(["kline_1h"]);
                // An unknown timeframe is the venue's own problem to drop at
                // subscribe time; the vocabulary does not second-guess it.
                expect(channelsFor("kline_custom")).toEqual(["kline_custom"]);
            });

            it("claims no private channel the login flow already subscribes to", () => {
                for (const requirement of PRIVATE_REQUIREMENTS) {
                    expect(
                        channelsFor(requirement),
                        `${adapter.id} maps the private requirement '${requirement}'; its socket already subscribes to that after login, so this would double every push`,
                    ).toEqual([]);
                }
            });

            it("returns an empty array for an unknown requirement", () => {
                expect(channelsFor("unknown_requirement")).toEqual([]);
                expect(channelsFor("")).toEqual([]);
            });

            it("survives non-strings from JS land", () => {
                expect(channelsFor(undefined as unknown as string)).toEqual([]);
                expect(channelsFor(null as unknown as string)).toEqual([]);
                expect(channelsFor({} as unknown as string)).toEqual([]);
            });

            it("does not resolve inherited Object properties", () => {
                // A plain `CHANNELS[requirement]` reaches Object.prototype and
                // would hand a function back where an array is expected.
                expect(channelsFor("toString")).toEqual([]);
                expect(channelsFor("constructor")).toEqual([]);
                expect(channelsFor("__proto__")).toEqual([]);
            });

            it("returns only strings", () => {
                for (const requirement of [...REQUIREMENTS_EVERY_VENUE_MUST_HAVE, "price"]) {
                    for (const channel of channelsFor(requirement)) {
                        expect(typeof channel).toBe("string");
                        expect(channel.length).toBeGreaterThan(0);
                    }
                }
            });
        });
    }
});

describe("channelsForRequirement — the venues disagree, and that is the point", () => {
    it("spells depth the way each venue does", () => {
        // The exact reason the table could not stay shared.
        expect(getExchangeAdapter("bitunix").marketData.channelsForRequirement("depth"))
            .toEqual(["depth_book5"]);
        expect(getExchangeAdapter("bitget").marketData.channelsForRequirement("depth"))
            .toEqual(["books5"]);
    });

    it("claims a price channel only where one exists", () => {
        expect(getExchangeAdapter("bitunix").marketData.channelsForRequirement("price"))
            .toEqual(["price"]);
        // Bitget has no separate price channel; the ticker carries it.
        // Claiming one would open a subscription that never delivers — the
        // BUG-0001 failure mode.
        expect(getExchangeAdapter("bitget").marketData.channelsForRequirement("price"))
            .toEqual([]);
    });
});
