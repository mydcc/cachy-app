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
 * **Levels and lines.** A grid of `levelCount` levels has `levelCount + 1`
 * price lines, the two bounds included; each level is the span between two
 * neighbouring lines. A long level opens with a buy on its lower line and
 * closes with a sell on its upper line; a short level opens with a sell on
 * its upper line and closes with a buy on its lower line. So the ladder holds
 * exactly `levelCount` opening orders, every counter-order lies inside the
 * range (ADR-0027 point 4), and the quote budget is split evenly across the
 * levels (point 10). The code calls a level a slot.
 */

import { Decimal } from "decimal.js";

import type { GridSide, GridSpacing } from "../rules/types";

/**
 * `decimal.js` rounds a quotient half-up at 20 significant digits, which can
 * land one unit above the exact value. A budget split must never do that, so
 * the divisions that decide how much a ladder spends use this constructor.
 */
const TruncatingDecimal = Decimal.clone({ rounding: Decimal.ROUND_DOWN });

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
  | "slot-below-step"
  /** A price, budget, fee rate or stop-out price is not a usable number. */
  | "invalid-input";

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
 * The price lines of a grid, bottom to top, both bounds included:
 * `levelCount + 1` of them, `levelCount` levels between.
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
  if (!isUsable(lower) || !isUsable(upper)) return { ok: false, reason: "invalid-input" };
  if (!Number.isInteger(levelCount) || levelCount < 2 || lower.lte(0) || upper.lte(lower)) {
    return { ok: false, reason: "invalid-range" };
  }
  const intervals = levelCount;
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

  // On a price step the bounds move *inward* — the lower line up, the upper
  // line down — so no order can rest outside the range the trader stated
  // (ADR-0027 point 4); interior lines go to the nearest step.
  const last = raw.length - 1;
  const lines = hasStep(priceStep)
    ? raw.map((price, i) =>
        i === 0
          ? price.toNearest(priceStep, Decimal.ROUND_CEIL)
          : i === last
            ? price.toNearest(priceStep, Decimal.ROUND_FLOOR)
            : price.toNearest(priceStep),
      )
    : raw;
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
 * 10): `Σ quantity × openPrice ≤ budget` holds because each slot spends at
 * most its share, and both divisions truncate rather than round half-up. A slot whose share does not buy one step is
 * refused rather than dropped, so the trader never runs a thinner ladder than
 * the one they configured.
 */
export function gridSlots(
  side: GridSide,
  lines: Decimal[],
  budget: Decimal,
  quantityStep?: Decimal,
): GridLadderResult<GridSlot[]> {
  if (!isUsable(budget) || lines.some((line) => !isUsable(line))) {
    return { ok: false, reason: "invalid-input" };
  }
  if (lines.length < 2 || budget.lte(0)) return { ok: false, reason: "invalid-range" };
  const slotCount = lines.length - 1;
  // Truncating division: at decimal.js's 20 significant digits a half-up
  // quotient can land a hair above the exact one, and a ladder must never
  // spend a hair more than its budget.
  const share = new TruncatingDecimal(budget).div(slotCount);
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
 * The smallest spacing, as a fraction of the lower price, at which one slot's
 * round trip earns more than its fees.
 *
 * A cycle buys `q` at `p₁` and sells `q` at `p₂`, paying the rate `f` on
 * both legs: it profits when `q(p₂ − p₁) > f·q(p₁ + p₂)`, that is when
 * `p₂ / p₁ > (1 + f) / (1 − f)`. The returned fraction is that ratio minus
 * one, `2f / (1 − f)` — slightly more than the `2f` a first glance suggests.
 * A short slot opens at `p₂` and closes at `p₁`, which is the same cycle
 * mirrored, so the bound is the same; both are measured against the lower
 * line, as `narrowestSpacing` measures.
 *
 * `null` for a rate that is not a fee: not a number, negative, or a whole
 * trade or more (`f ≥ 1` has no break-even spacing). A zero rate needs no
 * spacing.
 */
export function minimumViableSpacing(feeRate: Decimal): Decimal | null {
  if (!isUsable(feeRate) || feeRate.lt(0) || feeRate.gte(1)) return null;
  if (feeRate.isZero()) return new Decimal(0);
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
  /** Fees paid on the opening legs. */
  openFees: Decimal;
  /** Fees of both legs of every slot, a completed round trip each. */
  roundTripFees: Decimal;
  /**
   * What the account must be able to fund for the ladder: the notional plus
   * the opening-leg fees. Closing-leg fees are paid out of sale proceeds, not
   * reserved up front, so they are not in this figure.
   */
  reserveWithFees: Decimal;
}

/** What the ladder commits if every opening order fills and later closes. */
export function gridExposure(slots: GridSlot[], feeRate: Decimal): GridExposure {
  let notional = new Decimal(0);
  let openFees = new Decimal(0);
  let roundTripFees = new Decimal(0);
  for (const slot of slots) {
    const open = slot.quantity.times(slot.openPrice);
    const close = slot.quantity.times(slot.closePrice);
    notional = notional.plus(open);
    openFees = openFees.plus(open.times(feeRate));
    roundTripFees = roundTripFees.plus(open.plus(close).times(feeRate));
  }
  return { notional, openFees, roundTripFees, reserveWithFees: notional.plus(openFees) };
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
 * A slot that opened beyond the stop-out price (a long slot opened below it,
 * a short slot above it) would close at a gain, but a gain from a fill the
 * stop-out would have preempted must not offset a real loss, so each slot
 * contributes at least its fees, never less. The loss is therefore never
 * negative.
 *
 * The stop-out price is the caller's, because a stop-out is a condition, not
 * a number; the editor derives it where it can and says so where it cannot.
 * It must be a positive price, and the fee rate and the account must be real
 * numbers, or the call is refused. An account of zero or less has no
 * meaningful share, so it answers `null` rather than a division the trader
 * cannot read.
 */
export function gridWorstCase(
  side: GridSide,
  slots: GridSlot[],
  stopOutPrice: Decimal,
  feeRate: Decimal,
  accountEquity: Decimal,
): GridLadderResult<GridWorstCase> {
  if (
    !isUsable(stopOutPrice) ||
    stopOutPrice.lte(0) ||
    !isUsable(feeRate) ||
    feeRate.lt(0) ||
    !isUsable(accountEquity)
  ) {
    return { ok: false, reason: "invalid-input" };
  }
  let loss = new Decimal(0);
  for (const slot of slots) {
    const move =
      side === "long"
        ? slot.openPrice.minus(stopOutPrice)
        : stopOutPrice.minus(slot.openPrice);
    const fees = slot.openPrice.plus(stopOutPrice).times(slot.quantity).times(feeRate);
    loss = loss.plus(Decimal.max(move, 0).times(slot.quantity)).plus(fees);
  }
  const shareOfAccount = accountEquity.gt(0) ? loss.div(accountEquity) : null;
  return { ok: true, value: { loss, shareOfAccount } };
}

/** A real, finite number: not NaN, not ±Infinity. */
function isUsable(value: Decimal): boolean {
  return value.isFinite();
}

function hasStep(step: Decimal | undefined): step is Decimal {
  return step !== undefined && step.isFinite() && step.gt(0);
}

function roundDownToStep(quantity: Decimal, step: Decimal | undefined): Decimal {
  if (!hasStep(step)) return quantity;
  return quantity.div(step).floor().times(step);
}
