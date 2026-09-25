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
 * BUG-0512 — which price may price money.
 *
 * A stale mark price is still a positive number, so "is there a value?"
 * cannot tell live from frozen. This resolver ranks by age instead:
 *
 *   1. fresh mark price → prices PnL, not stale;
 *   2. fresh last price → prices PnL as a labelled substitute (a perp
 *      liquidates off mark, so the two are not the same quantity);
 *   3. anything provably old → last-known value flagged stale, or nothing
 *      when the trader disabled stale display.
 *
 * WS stays the primary source: every WS tick rewrites the mark price and its
 * stamp, so tier 1 wins whenever the socket is alive. The REST gap-bridge
 * (historyFetcher.pollSymbolChannel) only fills the gaps — and since it now
 * carries the venue's mark price, the bridge refreshes tier 1 instead of
 * leaving it frozen.
 *
 * `lastUpdated` is the age proxy for `lastPrice`: both are written together
 * by every price tick and every bridge poll. It overstates freshness when
 * only non-price channels tick (klines, depth) — the substitute flag covers
 * that residue: the number is shown, but never as a live mark.
 */

import { Decimal } from "decimal.js";

/**
 * Maximum age of a mark price before it stops pricing money. Aligned with
 * the market watcher's gap threshold (10 s): the bridge poll fires once a
 * symbol goes quiet for that long, so a mark older than this either missed
 * its bridge poll or outlived a dead price channel — both mean "do not
 * present as live".
 */
export const MAX_MARK_PRICE_AGE_MS = 10_000;

/**
 * Where a market quote was last observed (BUG-0558). WS ticks are the
 * primary source; REST only fills gaps (the historyFetcher bridge poll).
 * `"snapshot"` is never stored — analysis snapshots carry their own
 * `updatedAt` and are resolved at the display layer.
 */
export type QuoteSource = "ws" | "rest";

/** Display-level source: the stored source, or an analysis snapshot. */
export type MarketQuoteSource = QuoteSource | "snapshot";

export interface PriceInputs {
  /** Store mark price (WS primary, REST bridge). */
  markPrice: Decimal | null | undefined;
  /** Stamped in applyUpdate whenever a real mark value arrives. */
  markPriceUpdatedAt: number | undefined;
  /** Store last price (same writers as the mark). */
  lastPrice: Decimal | null | undefined;
  /** Symbol-level stamp — age proxy for lastPrice, see header. */
  lastUpdated: number | undefined;
  /** Position snapshot mark (Bitget; unstampable best effort). */
  fallbackMarkPrice: Decimal | null | undefined;
}

export interface ResolvedPrice {
  price: Decimal | undefined;
  /**
   * True whenever the price is not a fresh mark: substitute, or stale. The
   * caller renders the badge from this — a PnL priced off anything but a
   * fresh mark must be able to say so.
   */
  stale: boolean;
}

function isPrice(value: Decimal | null | undefined): value is Decimal {
  return value instanceof Decimal && value.gt(0);
}

function isFresh(stamp: number | undefined, now: number): boolean {
  return stamp !== undefined && now - stamp <= MAX_MARK_PRICE_AGE_MS;
}

export function resolvePricedMark(
  inputs: PriceInputs,
  now: number = Date.now(),
  allowStale: boolean = true,
): ResolvedPrice {
  const { markPrice, markPriceUpdatedAt, lastPrice, lastUpdated, fallbackMarkPrice } = inputs;

  // Tier 1: a fresh mark prices money, no badge.
  if (isPrice(markPrice) && isFresh(markPriceUpdatedAt, now)) {
    return { price: markPrice, stale: false };
  }

  // Tier 2: a fresh last price substitutes — labelled, never as mark.
  if (isPrice(lastPrice) && isFresh(lastUpdated, now)) {
    return { price: lastPrice, stale: true };
  }

  // Tier 3: nothing provably fresh. With stale display enabled the row keeps
  // a labelled last-known value (stale mark first — right quantity — then
  // the position snapshot, then last); disabled means honestly unpriced.
  if (allowStale) {
    const lastKnown = [markPrice, fallbackMarkPrice, lastPrice].find(isPrice);
    if (lastKnown) return { price: lastKnown, stale: true };
  }
  return { price: undefined, stale: false };
}

/**
 * Total unrealized PnL over the legs a total may honestly contain.
 *
 * A leg the row refuses to price (`unpriced` — stale display off, nothing
 * fresh) contributes nothing: its `unrealizedPnl` still carries the exchange
 * snapshot for type-shape reasons, and summing it would put a number the row
 * shows as "–" into the total. Stale-priced legs stay included — they render
 * a labelled number, and the total badge discloses the mix.
 */
export function totalPricedUnrealizedPnl(
  legs: Array<{ unrealizedPnl: Decimal; unpriced?: boolean }>,
): Decimal {
  return legs.reduce(
    (sum, leg) => (leg.unpriced ? sum : sum.plus(leg.unrealizedPnl)),
    new Decimal(0),
  );
}

export interface MarketQuoteInputs {
  /** Store last price (WS primary, REST gap-bridge). */
  lastPrice: Decimal | null | undefined;
  /** Stamped in applyUpdate whenever a real last-price value arrives. */
  lastPriceUpdatedAt: number | undefined;
  /** Source of the last stamped value; undefined when never stamped. */
  lastPriceSource: QuoteSource | undefined;
}

export interface ResolvedMarketQuote {
  /** Last-known value when one exists — stale quotes stay visible, labelled. */
  price: Decimal | undefined;
  /** True when the quote is not provably fresh. The caller badges from this. */
  stale: boolean;
  source: QuoteSource | undefined;
  /** Milliseconds since the stamp, or null when there is no stamp. */
  ageMs: number | null;
}

/**
 * BUG-0558 — which market quote may be shown as live, and which may seed
 * the calculator.
 *
 * Same age semantics as `resolvePricedMark` (BUG-0512), one tier simpler:
 * market tiles have no substitute quantity, so anything not provably fresh
 * keeps its last-known value with `stale: true`, and the caller — never this
 * function — decides whether a stale value may become an entry price. No
 * price at all resolves unpriced, so the tile renders "—" instead of $0.
 */
export function resolveMarketQuote(
  inputs: MarketQuoteInputs,
  now: number = Date.now(),
): ResolvedMarketQuote {
  const { lastPrice, lastPriceUpdatedAt, lastPriceSource } = inputs;
  if (!isPrice(lastPrice)) {
    return { price: undefined, stale: false, source: lastPriceSource, ageMs: null };
  }
  if (lastPriceUpdatedAt === undefined) {
    return { price: lastPrice, stale: true, source: lastPriceSource, ageMs: null };
  }
  const ageMs = now - lastPriceUpdatedAt;
  if (ageMs <= MAX_MARK_PRICE_AGE_MS) {
    return { price: lastPrice, stale: false, source: lastPriceSource, ageMs };
  }
  return { price: lastPrice, stale: true, source: lastPriceSource, ageMs };
}
