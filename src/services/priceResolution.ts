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
