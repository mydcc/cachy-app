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
 * Add-to-position arithmetic — FEAT-0334.
 *
 * What adding `addQuantity` to an open position does to its size and to its
 * average entry. Nothing here reads a store or calls an exchange; it is
 * `Decimal` arithmetic, testable on its own — the same shape
 * `partialClose.ts` established for the reduce side.
 *
 * ## Why this is arithmetic worth having in one place
 *
 * The average entry is what every stop distance and every risk figure in the
 * calculator is measured from. A trader scaling in needs to know where their
 * entry lands *before* deciding whether the add is survivable, and native
 * `number` here is a wrong entry price, which is a wrong stop distance, which
 * is money. So: `Decimal` throughout, and one function that owns the formula.
 *
 * ## Why quantities round down here too
 *
 * `roundDownToStep` is imported from `partialClose.ts` rather than restated —
 * a second implementation of the same rounding is how the two drift apart.
 * The *reason* to round down differs between the two sides, though:
 *
 * - A reduce rounds down because rounding up can exceed the position and open
 *   exposure the other way.
 * - An **add** rounds down because rounding up costs margin the preview did
 *   not show. A quantity that needs more margin than the figure the trader
 *   agreed to is the wrong direction to err in, and it is the direction that
 *   turns an accepted preview into a refused order.
 *
 * There is no position ceiling on this side: the ceiling is available margin,
 * and that is the gate's job (`orderGate.ts`, add branch), not this module's.
 *
 * ## What this module deliberately does not compute
 *
 * **No liquidation price.** FEAT-0334 asked whether the preview should show
 * one, and set the bar itself: only if the risk engine already exposes an
 * estimate that matches what the venue will report. It does not.
 *
 * - `calculateBaseMetrics` in `core.ts` uses `entry × (1 ∓ 1/leverage ± mmr)`,
 *   an isolated-margin, single-position approximation that ignores wallet
 *   balance, cross margin, other positions and the venue's tiered
 *   maintenance-margin table.
 * - `projectLiquidation` in `liquidation.ts` is better calibrated — it
 *   back-solves the MMR out of the venue's own entry/liquidation/leverage
 *   triple — but it projects across a *leverage* change at a fixed size. An
 *   add moves entry, size and margin tier at once, and a larger position can
 *   cross into a higher maintenance-margin tier that the back-solved MMR
 *   cannot know about. It would be right for small isolated adds and wrong
 *   for exactly the large ones where the number decides the trade.
 *
 * Beside a freshly computed average entry, such a figure reads as
 * authoritative while being merely close, and a liquidation price that is
 * close but wrong is a hazard, not a feature. See ADR-0010: estimates inform,
 * they never determine.
 */

import { Decimal } from "decimal.js";
import { roundDownToStep } from "./partialClose";
import type { PositionSide } from "./tpsl";

export type { PositionSide };

/** Everything an add needs to know about the position it increases. */
export interface AddToPositionContext {
    /** Size the venue currently reports, in base units. */
    positionAmount: Decimal;
    /** Average entry price the venue currently reports — the figure that moves. */
    entryPrice: Decimal;
    /** Current mark, the default estimate of where a market add fills. */
    markPrice: Decimal;
    /** Which way the position faces. An add never changes it. */
    side: PositionSide;
    /** Smallest quantity increment the instrument accepts. */
    stepSize: Decimal;
}

/** What the position would look like after the add — a preview, never stored. */
export interface AddToPositionPreview {
    /** The quantity that would be sent. */
    addQuantity: Decimal;
    /** Position size afterwards. */
    resultingAmount: Decimal;
    /** Average entry afterwards. The number this whole feature exists for. */
    resultingEntryPrice: Decimal;
    /**
     * How far the average entry moves, signed in price terms
     * (`resulting − current`). Positive means the entry rises.
     */
    entryShift: Decimal;
    /**
     * True when the add moves the entry *against* the position — worse for a
     * long (entry rises), worse for a short (entry falls). Adding above your
     * long's entry is ordinary and not an error; this flag exists so the UI
     * can state which way it went rather than leaving the trader to compare
     * two numbers under time pressure.
     */
    worsensEntry: boolean;
}

/**
 * Rounds an add quantity to a quantity the venue can fill.
 *
 * Down, never up: see the module note. A non-positive step means the
 * instrument's granularity has not loaded, and inventing one would be worse
 * than passing the quantity through — the gate still holds the margin ceiling.
 */
export function roundAddQuantityToStep(qty: Decimal, stepSize: Decimal): Decimal {
    return roundDownToStep(qty, stepSize);
}

/**
 * The add quantity a percentage represents, measured against the position
 * size the venue reports **now**.
 *
 * So 100 % doubles the position and 50 % adds half of it again. Measured
 * against the current size rather than against some notional target, for the
 * same reason `quantityFromPercent` does on the reduce side: a slider bound to
 * a live position naturally expresses "relative to what I hold", and that is
 * what a second add after the first one should mean.
 *
 * The percentage is a convenience, not a ceiling — the absolute field accepts
 * more, and available margin is what actually limits an add.
 */
export function addQuantityFromPercent(
    ctx: AddToPositionContext,
    percent: Decimal,
): Decimal {
    if (percent.lte(0)) return new Decimal(0);

    const raw = ctx.positionAmount.times(percent).div(100);
    const rounded = roundAddQuantityToStep(raw, ctx.stepSize);

    // Rounding down can reach zero for a small percentage of a small position.
    // One step is the smallest order the venue accepts, so that is the floor.
    // Unlike the reduce side there is no position ceiling to clamp against.
    if (rounded.lte(0)) return ctx.stepSize.gt(0) ? ctx.stepSize : new Decimal(0);
    return rounded;
}

/**
 * What percentage of the current position an add quantity represents. The
 * inverse of `addQuantityFromPercent` up to step rounding.
 *
 * A position of zero has no percentage to express — answers 0 rather than
 * dividing by it.
 */
export function percentFromAddQuantity(
    ctx: AddToPositionContext,
    qty: Decimal,
): Decimal {
    if (ctx.positionAmount.lte(0)) return new Decimal(0);
    return qty.div(ctx.positionAmount).times(100);
}

/**
 * Size and average entry after adding `addQuantity` at `fillPrice`.
 *
 *   newAvg = (oldAvg × oldQty + fillPrice × addQty) / (oldQty + addQty)
 *
 * `fillPrice` is the limit price for a limit add and the mark for a market
 * one — the caller decides which, because only the caller knows the order
 * type. Either way it is an *estimate of where the order fills*, which is why
 * everything this returns is a preview: once the venue reports the position
 * back, its average entry wins and this figure must stop being shown.
 *
 * The side does not enter the formula. An average entry is a weighted mean of
 * prices paid, and that is direction-agnostic; only the *interpretation* of
 * the shift differs, which is what `worsensEntry` carries.
 *
 * Answers `null` when there is nothing meaningful to preview — a non-positive
 * add, a non-finite or non-positive price, or a total size of zero. `null`
 * rather than a zero-filled preview, because a preview of zeros is a number a
 * trader can read as an answer.
 */
export function previewAdd(
    ctx: AddToPositionContext,
    addQuantity: Decimal,
    fillPrice: Decimal,
): AddToPositionPreview | null {
    if (!addQuantity.isFinite() || addQuantity.lte(0)) return null;
    if (!fillPrice.isFinite() || fillPrice.lte(0)) return null;

    const resultingAmount = ctx.positionAmount.plus(addQuantity);
    if (resultingAmount.lte(0)) return null;

    const resultingEntryPrice = ctx.entryPrice
        .times(ctx.positionAmount)
        .plus(fillPrice.times(addQuantity))
        .div(resultingAmount);

    const entryShift = resultingEntryPrice.minus(ctx.entryPrice);

    // A long is worse off when its average entry rises; a short when it falls.
    const worsensEntry =
        ctx.side === "LONG" ? entryShift.gt(0) : entryShift.lt(0);

    return {
        addQuantity,
        resultingAmount,
        resultingEntryPrice,
        entryShift,
        worsensEntry,
    };
}

/**
 * Initial margin the add consumes: `notional / leverage`.
 *
 * The plain isolated-margin figure, deliberately gross of fees and of any
 * maintenance-margin buffer. It exists to *refuse* an add that cannot be
 * funded (`orderGate.ts`), and a refusal threshold that guessed at fees would
 * refuse fundable orders — the venue is the authority on what it accepts, and
 * this only catches the case where the answer is plainly no.
 *
 * A non-positive or non-finite leverage means the account state has not
 * loaded; answering with the full notional is the conservative reading (1×, no
 * leverage assumed) rather than dividing by zero.
 */
export function requiredMargin(
    addQuantity: Decimal,
    fillPrice: Decimal,
    leverage: Decimal,
): Decimal {
    const notional = addQuantity.times(fillPrice);
    if (!leverage.isFinite() || leverage.lte(0)) return notional;
    return notional.div(leverage);
}
