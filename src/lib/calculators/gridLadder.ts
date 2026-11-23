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

/**
 * FEAT-0819 stage 2 — the arithmetic of a grid ladder (ADR-0027).
 *
 * Pure functions over `Decimal`, no store, no book, no clock. The runtime
 * (stage 4) and the editor (stage 5) both read from here, so the number the
 * trader is shown before start and the number the runtime places are the
 * same computation.
 *
 * **Lines and slots.** A grid of `levelCount` price lines has
 * `levelCount − 1` opening slots. A long grid opens with a buy on line `i`
 * and closes it with a sell on line `i + 1`; a short grid opens with a sell
 * on line `i + 1` and closes with a buy on line `i`. The top line of a long
 * grid (the bottom line of a short one) is therefore a closing line only:
 * its counter-order would lie outside the range, which ADR-0027 forbids.
 * The quote budget is split across the opening slots, because they are what
 * spends it.
 */

import { Decimal } from "decimal.js";

import type { GridSide, GridSpacing } from "../rules/types";

export interface GridRange {
  lower: Decimal;
  upper: Decimal;
  levelCount: number;
  spacing: GridSpacing;
}

/** Why a ladder cannot be built from a document and an instrument. */
export type GridLadderRefusal =
  /** The range or level count is not one the core accepts. */
  | "invalid-range"
  /** Rounding to the price step merged two lines into one. */
  | "levels-collapse"
  /** A slot's share of the budget buys less than one quantity step. */
  | "slot-below-step";

export type GridLadderResult<T> = { ok: true; value: T } | { ok: false; reason: GridLadderRefusal };

/** One opening slot: where it opens, where it closes, and how much. */
export interface GridSlot {
  /** Index of the slot, 0 at the bottom of the range. */
  index: number;
  /** The line the opening order rests on. */
  openPrice: Decimal;
  /** The line the counter-order rests on, one step away. */
  closePrice: Decimal;
  /** Base-asset quantity, rounded down to the quantity step. */
  quantity: Decimal;
}

/**
 * The price lines of a grid, bottom to top, both bounds included.
 *
 * Arithmetic spacing adds a constant amount; geometric spacing multiplies by
 * a constant ratio. With a `priceStep`, each line is rounded to the nearest
 * step (a resting order must sit on a price the venue accepts), and a ladder
 * whose rounded lines coincide is refused rather than silently thinned.
 */
export function gridLines(
  range: GridRange,
  priceStep?: Decimal,
): GridLadderResult<Decimal[]> {
  const { lower, upper, levelCount, spacing } = range;
  if (!Number.isInteger(levelCount) || levelCount < 2 || lower.lte(0) || upper.lte(lower)) {
    return { ok: false, reason: "invalid-range" };
  }
  const intervals = levelCount - 1;
  const raw: Decimal[] = [];
  if (spacing === "arithmetic") {
    const step = upper.minus(lower).div(intervals);
    for (let i = 0; i < intervals; i++) raw.push(lower.plus(step.times(i)));
  } else {
    const ratio = upper.div(lower).pow(new Decimal(1).div(intervals));
    for (let i = 0; i < intervals; i++) raw.push(lower.times(ratio.pow(i)));
  }
  // The top bound is the document's own value, not an accumulated product,
  // so a geometric ladder ends exactly where the trader said it would.
  raw.push(upper);

  const lines = hasStep(priceStep) ? raw.map((price) => price.toNearest(priceStep)) : raw;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].lte(lines[i - 1])) return { ok: false, reason: "levels-collapse" };
  }
  if (lines[0].lte(0)) return { ok: false, reason: "levels-collapse" };
  return { ok: true, value: lines };
}

/**
 * The opening slots of a ladder, each sized from an even share of the quote
 * budget and rounded down to the quantity step.
 *
 * Rounding down is what keeps the ladder inside its budget (ADR-0027 point
 * 10): `Σ quantity × openPrice ≤ budget` holds by construction, because each
 * slot spends at most its share. A slot whose share does not buy one step is
 * refused rather than dropped, so the trader never runs a thinner ladder than
 * the one they configured.
 */
export function gridSlots(
  side: GridSide,
  lines: Decimal[],
  budget: Decimal,
  quantityStep?: Decimal,
): GridLadderResult<GridSlot[]> {
  if (lines.length < 2 || budget.lte(0)) return { ok: false, reason: "invalid-range" };
  const slotCount = lines.length - 1;
  const share = budget.div(slotCount);
  const slots: GridSlot[] = [];
  for (let index = 0; index < slotCount; index++) {
    const below = lines[index];
    const above = lines[index + 1];
    const openPrice = side === "long" ? below : above;
    const closePrice = side === "long" ? above : below;
    const quantity = roundDownToStep(share.div(openPrice), quantityStep);
    if (quantity.lte(0)) return { ok: false, reason: "slot-below-step" };
    slots.push({ index, openPrice, closePrice, quantity });
  }
  return { ok: true, value: slots };
}

/**
 * The slot whose opposite order a fill makes due (ADR-0027 point 4).
 *
 * An opening fill on a slot makes that slot's closing order due; a closing
 * fill makes the same slot's opening order due again. The slot never moves,
 * so a counter-order is always inside the range — the closing line of the
 * last slot is the range's own bound.
 */
export function counterOrderOf(slot: GridSlot, filled: "open" | "close"): { leg: "open" | "close"; price: Decimal } {
  return filled === "open"
    ? { leg: "close", price: slot.closePrice }
    : { leg: "open", price: slot.openPrice };
}

/**
 * The smallest spacing, as a fraction of the opening price, at which one
 * slot's round trip earns more than its fees.
 *
 * A cycle buys `q` at `p₁` and sells `q` at `p₂`, paying the rate `f` on
 * both legs: it profits when `q(p₂ − p₁) > f·q(p₁ + p₂)`, that is when
 * `p₂ / p₁ > (1 + f) / (1 − f)`. The returned fraction is that ratio minus
 * one, `2f / (1 − f)` — slightly more than the `2f` a first glance suggests.
 * The short mirror gives the same bound.
 */
export function minimumViableSpacing(feeRate: Decimal): Decimal {
  if (feeRate.lte(0)) return new Decimal(0);
  return feeRate.times(2).div(new Decimal(1).minus(feeRate));
}

/** The narrowest slot of a ladder, as a fraction of its lower line. */
export function narrowestSpacing(lines: Decimal[]): Decimal | null {
  let narrowest: Decimal | null = null;
  for (let i = 1; i < lines.length; i++) {
    const spacing = lines[i].div(lines[i - 1]).minus(1);
    if (narrowest === null || spacing.lt(narrowest)) narrowest = spacing;
  }
  return narrowest;
}

export interface GridExposure {
  /** Quote spent if every opening order fills, without fees. */
  notional: Decimal;
  /** Notional plus the fees of both legs of every slot. */
  budgetWithFees: Decimal;
}

/** What the ladder commits if every opening order fills and later closes. */
export function gridExposure(slots: GridSlot[], feeRate: Decimal): GridExposure {
  let notional = new Decimal(0);
  let fees = new Decimal(0);
  for (const slot of slots) {
    const open = slot.quantity.times(slot.openPrice);
    notional = notional.plus(open);
    fees = fees.plus(open.plus(slot.quantity.times(slot.closePrice)).times(feeRate));
  }
  return { notional, budgetWithFees: notional.plus(fees) };
}

export interface GridWorstCase {
  /** The loss, in quote, as a positive amount. */
  loss: Decimal;
  /** The loss as a share of the account, `0.12` for twelve percent. */
  shareOfAccount: Decimal | null;
}

/**
 * The worst case the trader is shown before start (ADR-0027 point 10): every
 * opening order filled, the whole position closed at the stop-out price, fees
 * on both legs.
 *
 * The stop-out price is the caller's, because a stop-out is a condition, not
 * a number; the editor derives it where it can and says so where it cannot.
 * An account of zero or less has no meaningful share, so it answers `null`
 * rather than a division the trader cannot read.
 */
export function gridWorstCase(
  side: GridSide,
  slots: GridSlot[],
  stopOutPrice: Decimal,
  feeRate: Decimal,
  accountEquity: Decimal,
): GridWorstCase {
  let loss = new Decimal(0);
  for (const slot of slots) {
    const move =
      side === "long"
        ? slot.openPrice.minus(stopOutPrice)
        : stopOutPrice.minus(slot.openPrice);
    const fees = slot.openPrice.plus(stopOutPrice).times(slot.quantity).times(feeRate);
    loss = loss.plus(move.times(slot.quantity)).plus(fees);
  }
  const shareOfAccount = accountEquity.gt(0) ? loss.div(accountEquity) : null;
  return { loss, shareOfAccount };
}

function hasStep(step: Decimal | undefined): step is Decimal {
  return step !== undefined && step.isFinite() && step.gt(0);
}

function roundDownToStep(quantity: Decimal, step: Decimal | undefined): Decimal {
  if (!hasStep(step)) return quantity;
  return quantity.div(step).floor().times(step);
}
