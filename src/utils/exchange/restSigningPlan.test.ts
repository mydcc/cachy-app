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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The query-string helpers here are only correct if they produce byte-identical
 * output to the server signers. These tests therefore compare against
 * `generateBitunixSignature` itself rather than against a restated formula —
 * restating it would pass while both sides drifted together.
 */
import { describe, it, expect } from "vitest";
import {
  ROUTE_SIGNING_PLAN,
  canonicalQueryParamsInput,
  canonicalQueryString,
  planForRoute,
  routeTakesPassphrase,
} from "./restSigningPlan";
import { generateBitunixSignature } from "../server/bitunix";

const API_KEY = "test-api-key-0001";
const API_SECRET = "test-api-secret-0001";

describe("ROUTE_SIGNING_PLAN", () => {
  it("covers all twelve migrated proxy routes", () => {
    expect(Object.keys(ROUTE_SIGNING_PLAN)).toHaveLength(12);
  });

  it("marks exactly the four resolveVenue routes as multi-venue", () => {
    const both = Object.entries(ROUTE_SIGNING_PLAN)
      .filter(([, plan]) => plan.venues.length === 2)
      .map(([route]) => route)
      .sort();

    expect(both).toEqual([
      "/api/account",
      "/api/balance",
      "/api/orders",
      "/api/positions",
    ]);
  });

  // `/api/account-settings` is the one route that still takes an `exchange`
  // field but has a single venue. Bitget implements none of the family —
  // `executeAccountSetting` answers `null` for every action — so listing it
  // would let a Bitget account sign a request whose only possible outcome is a
  // refusal. Naming Bitunix alone is what makes the client refuse while it is
  // building the envelope, rather than after the route has seen it.
  it("names Bitunix alone for the family Bitget does not implement", () => {
    expect(ROUTE_SIGNING_PLAN["/api/account-settings"].venues).toEqual([
      "bitunix",
    ]);
  });

  it("signs query strings everywhere except orders and account-settings", () => {
    const bodySigned = Object.entries(ROUTE_SIGNING_PLAN)
      .filter(([, plan]) => plan.signed === "body")
      .map(([route]) => route)
      .sort();

    expect(bodySigned).toEqual(["/api/account-settings", "/api/orders"]);
  });
});

describe("planForRoute", () => {
  it("resolves a bare path", () => {
    expect(planForRoute("/api/orders")?.signed).toBe("body");
  });

  it("ignores a query string and a hash", () => {
    expect(planForRoute("/api/sync/orders?limit=500")?.signed).toBe("query");
    expect(planForRoute("/api/balance#x")?.signed).toBe("query");
  });

  it("returns null for a route that has not been cut over", () => {
    expect(planForRoute("/api/klines")).toBeNull();
  });

  it("does not match a prefix of a migrated route", () => {
    expect(planForRoute("/api/sync/positions-pending-x")).toBeNull();
  });

  // The guard answers a miss with a silent `return`, so a path variant the
  // lookup cannot see is a route the guard cannot protect. SvelteKit's
  // `trailingSlash: 'never'` already 308s these before a handler runs; these
  // pin the lookup's own normalisation so it does not depend on that holding.
  it("resolves a path with a trailing slash", () => {
    expect(planForRoute("/api/orders/")?.signed).toBe("body");
  });

  it("resolves a path with repeated leading slashes", () => {
    expect(planForRoute("//api/orders")?.signed).toBe("body");
  });

  it("resolves a variant that still carries a query string", () => {
    expect(planForRoute("/api/sync/orders/?limit=500")?.signed).toBe("query");
  });
});

describe("routeTakesPassphrase", () => {
  it("is true only for a Bitget-reachable route", () => {
    expect(routeTakesPassphrase(ROUTE_SIGNING_PLAN["/api/balance"])).toBe(true);
    expect(routeTakesPassphrase(ROUTE_SIGNING_PLAN["/api/tpsl"])).toBe(false);
    expect(routeTakesPassphrase(ROUTE_SIGNING_PLAN["/api/sync"])).toBe(false);
  });
});

describe("canonicalQueryString", () => {
  it("matches the server signer's query string byte for byte", () => {
    // Mixed case on purpose: `localeCompare` and `<` order these differently,
    // so the assertion is sensitive to the comparator and not just to sorting.
    const params = { symbol: "BTCUSDT", MarginCoin: "USDT", reduceOnly: "true" };

    expect(canonicalQueryString(params)).toBe(
      generateBitunixSignature(API_KEY, API_SECRET, params, null).queryString,
    );
  });

  it("agrees with the server across several parameter shapes", () => {
    const shapes: Record<string, string>[] = [
      {},
      { a: "1" },
      { b: "2", a: "1", c: "3" },
      { endTime: "1700000000000", startTime: "1600000000000", symbol: "ETHUSDT" },
      { Zulu: "z", alpha: "a", Mike: "m", bravo: "b" },
    ];

    for (const params of shapes) {
      expect(canonicalQueryString(params)).toBe(
        generateBitunixSignature(API_KEY, API_SECRET, params, null).queryString,
      );
    }
  });

  it("sorts keys rather than preserving insertion order", () => {
    expect(canonicalQueryString({ z: "1", a: "2" })).toBe("a=2&z=1");
  });
});

describe("canonicalQueryParamsInput", () => {
  it("concatenates sorted key/value pairs with no delimiter", () => {
    expect(canonicalQueryParamsInput({ b: "2", a: "1" })).toBe("a1b2");
  });

  it("is empty for no parameters", () => {
    expect(canonicalQueryParamsInput({})).toBe("");
  });
});
