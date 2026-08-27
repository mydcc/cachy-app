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

import { describe, it, expect } from "vitest";
import { VENUES, DEFAULT_VENUE_ID, resolveVenue } from "./index";
import type { VenueModule } from "./types";

/**
 * FEAT-0228's fourth acceptance criterion is "adding a venue means adding one
 * module and one registry entry". That only stays true if the registry is
 * the single place the routes look, and if a module that forgets half the
 * interface fails here rather than at runtime on someone's money path.
 */

// Every member a proxy route calls on a resolved venue. A new route method
// belongs in this list, which is what makes a half-implemented venue fail
// loudly instead of throwing on the first request that reaches it.
const REQUIRED_METHODS: (keyof VenueModule)[] = [
  "validateKeys",
  "fetchAccount",
  "fetchBalance",
  "fetchKlines",
  "fetchPositions",
  "tickersUrl",
  "isSymbolNotFoundBody",
  "executeOrder",
];

describe("venue registry", () => {
  it("keys every module under its own id", () => {
    for (const [id, venue] of Object.entries(VENUES)) {
      expect(venue.id).toBe(id);
    }
  });

  it("registers a module for the default venue", () => {
    expect(VENUES[DEFAULT_VENUE_ID]).toBeDefined();
  });

  it("declares whether each venue needs a passphrase", () => {
    for (const venue of Object.values(VENUES)) {
      expect(typeof venue.requiresPassphrase).toBe("boolean");
    }
    // The routes rely on this to decide the 400 before any upstream call.
    expect(VENUES.bitunix.requiresPassphrase).toBe(false);
    expect(VENUES.bitget.requiresPassphrase).toBe(true);
  });

  it("implements the whole venue interface in every module", () => {
    for (const [id, venue] of Object.entries(VENUES)) {
      for (const method of REQUIRED_METHODS) {
        expect(
          typeof venue[method],
          `${id} is missing ${String(method)}`,
        ).toBe("function");
      }
    }
  });
});

describe("resolveVenue", () => {
  it("resolves every registered id", () => {
    for (const id of Object.keys(VENUES)) {
      expect(resolveVenue(id)).toBe(VENUES[id as keyof typeof VENUES]);
    }
  });

  it("returns undefined for an unknown or absent id", () => {
    // The klines and tickers routes depend on this: an unrecognised provider
    // falls back to the default venue instead of erroring.
    expect(resolveVenue("binance")).toBeUndefined();
    expect(resolveVenue("")).toBeUndefined();
    expect(resolveVenue(null)).toBeUndefined();
    expect(resolveVenue(undefined)).toBeUndefined();
  });

  it("does not resolve inherited Object properties", () => {
    // `VENUES[id]` on a plain object literal would happily hand back
    // Object.prototype members for an attacker-supplied provider string.
    expect(resolveVenue("toString")).toBeUndefined();
    expect(resolveVenue("constructor")).toBeUndefined();
    expect(resolveVenue("__proto__")).toBeUndefined();
  });
});
