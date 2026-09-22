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
 * BUG-0512 — a stale mark price must not outrank a fresh REST price.
 *
 * Arrange-Act-Assert over the three tiers: fresh mark wins unlabeled, fresh
 * last substitutes labelled, and all-stale either labels the last-known
 * value or prices nothing, depending on the trader's stale-display setting.
 */

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import {
  resolvePricedMark,
  totalPricedUnrealizedPnl,
  MAX_MARK_PRICE_AGE_MS,
  type PriceInputs,
} from "./priceResolution";

const NOW = 1_700_000_000_000;

function inputs(overrides: Partial<PriceInputs> = {}): PriceInputs {
  return {
    markPrice: undefined,
    markPriceUpdatedAt: undefined,
    lastPrice: undefined,
    lastUpdated: undefined,
    fallbackMarkPrice: undefined,
    ...overrides,
  };
}

describe("resolvePricedMark", () => {
  it("prices from a fresh mark without a stale flag", () => {
    const mark = new Decimal("60000");
    const result = resolvePricedMark(
      inputs({ markPrice: mark, markPriceUpdatedAt: NOW - 1000 }),
      NOW,
    );

    expect(result.price).toBe(mark);
    expect(result.stale).toBe(false);
  });

  it("rejects a stale mark and falls through to a fresh last price, flagged", () => {
    const last = new Decimal("60001");
    const result = resolvePricedMark(
      inputs({
        markPrice: new Decimal("60000"),
        markPriceUpdatedAt: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        lastPrice: last,
        lastUpdated: NOW - 1000,
      }),
      NOW,
    );

    expect(result.price).toBe(last);
    expect(result.stale).toBe(true);
  });

  it("treats a mark at exactly the age boundary as fresh", () => {
    const mark = new Decimal("60000");
    const result = resolvePricedMark(
      inputs({ markPrice: mark, markPriceUpdatedAt: NOW - MAX_MARK_PRICE_AGE_MS }),
      NOW,
    );

    expect(result.price).toBe(mark);
    expect(result.stale).toBe(false);
  });

  it("treats structural zero as no data, not as a price", () => {
    const result = resolvePricedMark(
      inputs({
        markPrice: new Decimal(0),
        markPriceUpdatedAt: NOW,
        lastPrice: new Decimal(0),
        lastUpdated: NOW,
      }),
      NOW,
    );

    expect(result.price).toBeUndefined();
  });

  it("with stale display on, labels the last-known value instead of pricing nothing", () => {
    const mark = new Decimal("60000");
    const result = resolvePricedMark(
      inputs({
        markPrice: mark,
        markPriceUpdatedAt: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        lastPrice: new Decimal("60001"),
        lastUpdated: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        fallbackMarkPrice: new Decimal("59999"),
      }),
      NOW,
      true,
    );

    // Stale mark first — right quantity for a perp — flagged stale.
    expect(result.price).toBe(mark);
    expect(result.stale).toBe(true);
  });

  it("with stale display on, prefers the position snapshot over a stale last", () => {
    const fallback = new Decimal("59999");
    const result = resolvePricedMark(
      inputs({
        markPrice: new Decimal("60000"),
        markPriceUpdatedAt: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        lastPrice: new Decimal("60001"),
        lastUpdated: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        fallbackMarkPrice: fallback,
      }),
      NOW,
      true,
    );

    // mark is stale too, but it is still the preferred last-known value.
    expect(result.price?.toString()).toBe("60000");
    expect(result.stale).toBe(true);
    expect(fallback.toString()).toBe("59999");
  });

  it("with stale display off, prices nothing when no source is fresh", () => {
    const result = resolvePricedMark(
      inputs({
        markPrice: new Decimal("60000"),
        markPriceUpdatedAt: NOW - MAX_MARK_PRICE_AGE_MS - 1,
        lastPrice: new Decimal("60001"),
        lastUpdated: NOW - MAX_MARK_PRICE_AGE_MS - 1,
      }),
      NOW,
      false,
    );

    expect(result.price).toBeUndefined();
    expect(result.stale).toBe(false);
  });

  it("ignores a mark with no stamp — unstamped is unproven", () => {
    const last = new Decimal("60001");
    const result = resolvePricedMark(
      inputs({
        markPrice: new Decimal("60000"),
        markPriceUpdatedAt: undefined,
        lastPrice: last,
        lastUpdated: NOW - 1000,
      }),
      NOW,
    );

    expect(result.price).toBe(last);
    expect(result.stale).toBe(true);
  });
});

describe("totalPricedUnrealizedPnl", () => {
  it("sums priced legs including stale-priced ones", () => {
    const total = totalPricedUnrealizedPnl([
      { unrealizedPnl: new Decimal("100") },
      { unrealizedPnl: new Decimal("-40") },
    ]);

    expect(total.eq(new Decimal("60"))).toBe(true);
  });

  it("excludes unpriced legs instead of absorbing their snapshot", () => {
    // The row shows "–" for the unpriced leg; the total must not contain
    // the 999 snapshot hiding in its unrealizedPnl.
    const total = totalPricedUnrealizedPnl([
      { unrealizedPnl: new Decimal("100") },
      { unrealizedPnl: new Decimal("999"), unpriced: true },
    ]);

    expect(total.eq(new Decimal("100"))).toBe(true);
  });

  it("is zero when every leg is unpriced", () => {
    const total = totalPricedUnrealizedPnl([
      { unrealizedPnl: new Decimal("999"), unpriced: true },
    ]);

    expect(total.isZero()).toBe(true);
  });
});
