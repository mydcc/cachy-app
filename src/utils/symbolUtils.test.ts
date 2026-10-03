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
import {
  normalizeSymbol,
  formatSymbolForDisplay,
  stripLegacyVenueSuffix,
} from "./symbolUtils";

/**
 * BUG-0599. `_UMCBL` was the V1 wire suffix; V2 addresses contracts by the bare
 * pair and answers `40034 "Parameter BTCUSDT_UMCBL does not exist"` for the
 * suffixed form (verified against the live venue, 2026-09-30):
 *
 *   curl -s 'https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT_UMCBL&productType=USDT-FUTURES&granularity=1m&limit=1'
 *   # {"code":"40034","msg":"Parameter BTCUSDT_UMCBL does not exist","data":null}
 *
 * So the suffix cannot appear in anything `normalizeSymbol` produces. The
 * direction matters: stripping a suffix that arrives from a persisted payload
 * is canonicalisation, while appending one the venue rejects is the defect.
 */
describe("normalizeSymbol for Bitget V2", () => {
  it("returns a contract the live Bitget API accepts", () => {
    // The bare pair is what V2 addresses. Appending `_UMCBL` here is the
    // defect this pins: every caller inherits the rejected form.
    expect(normalizeSymbol("BTCUSDT", "bitget")).toBe("BTCUSDT");
  });

  it("canonicalizes a symbol that still carries the V1 suffix", () => {
    // Journal entries, presets and a persisted trade symbol written before
    // BUG-0599 can still hold the suffixed form. Normalizing must converge
    // them on the canonical key, not pass the suffix through.
    expect(normalizeSymbol("BTCUSDT_UMCBL", "bitget")).toBe("BTCUSDT");
  });

  it("keeps the bare-pair heuristic for a base asset", () => {
    expect(normalizeSymbol("btc", "bitget")).toBe("BTCUSDT");
  });

  it("leaves a Bitunix symbol untouched", () => {
    // Bitunix never used the suffix, so its callers must see no change at all.
    expect(normalizeSymbol("BTCUSDT", "bitunix")).toBe("BTCUSDT");
    expect(normalizeSymbol("btc", "bitunix")).toBe("BTCUSDT");
  });

  it("is idempotent", () => {
    // Store keys are written and read by this same function, so a second pass
    // has to be a no-op or the key would drift between write and read.
    for (const provider of ["bitget", "bitunix"]) {
      const once = normalizeSymbol("BTCUSDT", provider);
      expect(normalizeSymbol(once, provider)).toBe(once);
    }
  });
});

describe("formatSymbolForDisplay", () => {
  it("still strips the suffix so pre-existing local-first data renders", () => {
    // Journal entries, presets and watchlist entries were written with the
    // suffix and are Class A data on the user's device. Dropping this strip
    // would break history the user can see.
    expect(formatSymbolForDisplay("BTCUSDT_UMCBL")).toBe("BTC");
    expect(formatSymbolForDisplay("BTCUSDT")).toBe("BTC");
  });
});

describe("stripLegacyVenueSuffix", () => {
  it("strips a suffixed key back to the contract", () => {
    // The boundary guarantee for anything that reached a store before
    // BUG-0599 — the wire, and the three stores that persisted under it.
    // `formatSymbolForDisplay` cannot do this job: it also strips `USDT`, which
    // would ask the venue about a contract that does not exist.
    expect(stripLegacyVenueSuffix("BTCUSDT_UMCBL")).toBe("BTCUSDT");
    expect(stripLegacyVenueSuffix("BTCUSDT")).toBe("BTCUSDT");
    expect(stripLegacyVenueSuffix("")).toBe("");
  });
});
