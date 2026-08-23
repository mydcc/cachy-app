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
 * Partial-close arithmetic — FEAT-0256.
 *
 * How much of a position a percentage represents, what is left afterwards, and
 * what the close would realise at the current mark. Nothing here reads a store
 * or calls an exchange; it is `Decimal` arithmetic, testable on its own.
 *
 * ## Why quantities do not round like prices
 *
 * `tpsl.ts`'s `roundToTick` rounds a price to nearest, because that is what the
 * venue does to a price. A *quantity* cannot be treated the same way, for two
 * reasons that both end in a wrong order:
 *
 * 1. **Rounding up can exceed the position.** A reduce larger than the position
 *    does not close it — it opens exposure the other way. The gate refuses that
 *    (`orderGate.ts`, reduce branch), but a control that routinely produces
 *    refused orders is a broken control, not a safe one.
 * 2. **A full close is not a rounding problem.** With a position of 0.7 and a
 *    step of 0.3, every rounding of 0.7 gives 0.6, and 0.1 silently stays open.
 *    100 % therefore bypasses rounding entirely and submits the exact amount
 *    the venue reports — which is by construction an amount it can fill.
 *
 * So: partial quantities round **down** to the step, and the full amount passes
 * through untouched. `quantityFromPercent` is the single place that holds both
 * rules, so no caller has to remember them.
 */

import { Decimal } from "decimal.js";
import type { PositionSide } from "./tpsl";

export type { PositionSide };

/** Everything a partial close needs to know about the position it reduces. */
export interface PartialCloseContext {
    /** Size the venue currently reports, in base units. The ceiling. */
    positionAmount: Decimal;
    /** Average entry price, for the realised-PnL readout. */
    entryPrice: Decimal;
    /** Current mark, for the realised-PnL readout. */
    markPrice: Decimal;
    /** Which way the position faces. */
    side: PositionSide;
    /** Smallest quantity increment the instrument accepts. */
    stepSize: Decimal;
}

/**
 * Rounds a quantity **down** to a whole multiple of the step.
 *
 * Down, not nearest: see the module note. A non-positive step means the
 * instrument's granularity is unknown, and inventing one would be worse than
 * passing the quantity through — the gate still holds the position ceiling.
 */
export function roundDownToStep(qty: Decimal, stepSize: Decimal): Decimal {
    if (stepSize.lte(0) || !stepSize.isFinite()) return qty;
    return qty.div(stepSize).toDecimalPlaces(0, Decimal.ROUND_DOWN).times(stepSize);
}

/**
 * True when `qty` is a whole multiple of the step, i.e. a quantity the venue
 * can actually fill. Used by the gate, which refuses a *partial* reduce that
 * fails it.
 *
 * A non-positive step means unknown granularity — nothing can be proven, so
 * nothing is claimed, and this answers `true` rather than refusing every order
 * on an instrument whose metadata has not loaded.
 */
export function isWholeMultipleOfStep(qty: Decimal, stepSize: Decimal): boolean {
    if (stepSize.lte(0) || !stepSize.isFinite()) return true;
    return qty.div(stepSize).isInteger();
}

/**
 * The quantity a percentage of the position represents.
 *
 * `percent` runs 0..100 against the position size the venue reports *now*, so
 * after closing half once, a second 50 % closes half of what is left rather
 * than a quarter of the original. That is what exchanges do, and it is what a
 * slider bound to a live position naturally expresses.
 *
 * At 100 % the exact position amount is returned, unrounded — a full close is
 * not a rounding problem (see the module note). Below that, the quantity rounds
 * down to the step, so it can never exceed the position.
 */
export function quantityFromPercent(
    ctx: PartialCloseContext,
    percent: Decimal,
): Decimal {
    if (percent.gte(100)) return ctx.positionAmount;
    if (percent.lte(0)) return new Decimal(0);

    const raw = ctx.positionAmount.times(percent).div(100);
    const rounded = roundDownToStep(raw, ctx.stepSize);

    // Rounding down can reach zero for a small percentage of a small position.
    // One step is the smallest order the venue accepts, so that is the floor —
    // but never above the position itself, which a one-step floor could exceed
    // on an instrument whose step is coarser than the position.
    if (rounded.lte(0)) {
        return Decimal.min(ctx.stepSize, ctx.positionAmount);
    }
    return rounded;
}

/**
 * What percentage of the position a quantity represents. The inverse of
 * `quantityFromPercent` up to step rounding — exact only for quantities that
 * are already whole multiples of the step, which is every quantity that
 * function produces.
 */
export function percentFromQuantity(
    ctx: PartialCloseContext,
    qty: Decimal,
): Decimal {
    if (ctx.positionAmount.lte(0)) return new Decimal(0);
    return qty.div(ctx.positionAmount).times(100);
}

/** What stays open after closing `qty`. Never negative. */
export function remainingAfterClose(
    ctx: PartialCloseContext,
    qty: Decimal,
): Decimal {
    return Decimal.max(ctx.positionAmount.minus(qty), new Decimal(0));
}

/**
 * The PnL the close would realise at the current mark, **gross of fees**.
 *
 * Gross, in line with [ADR-0010](../../../docs/adr/0010-estimates-inform-but-never-determine-what-is-sent.md):
 * the fee rate Cachy holds is hand-entered and the exit leg's rate is not known
 * until the order resolves. Here that discipline costs nothing, because this
 * figure drives nothing — the quantity is what reaches the venue, and it comes
 * from `quantityFromPercent`, which never sees a fee. A net line can be shown
 * beside this one the way `TpSlPriceInput` shows it, and would not change the
 * order either way.
 */
export function realizedPnlOnClose(
    ctx: PartialCloseContext,
    qty: Decimal,
): Decimal {
    const move =
        ctx.side === "LONG"
            ? ctx.markPrice.minus(ctx.entryPrice)
            : ctx.entryPrice.minus(ctx.markPrice);
    return move.times(qty);
}

/**
 * True when `qty` closes the whole position.
 *
 * Compared against the position amount rather than against 100 %, because the
 * percentage is a derived display value and the amount is the thing the venue
 * reports. The caller uses this to set `forceFullClose`, which changes what the
 * gate checks — so getting it from the wrong source would mean the gate
 * verifies a different intent than the trader expressed.
 */
export function isFullClose(ctx: PartialCloseContext, qty: Decimal): boolean {
    return qty.gte(ctx.positionAmount);
}
