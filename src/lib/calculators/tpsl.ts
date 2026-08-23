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
 * TP/SL trigger-price arithmetic — FEAT-0254.
 *
 * The inverse of what `core.ts` already does. `calculateIndividualTp` goes
 * *forward*: given a TP price, what is the resulting price change, profit and
 * return on capital. This module goes *backward*: given a target change, ROI
 * or PnL, what trigger price produces it.
 *
 * Both directions have to exist because the slider is two-way — dragging it
 * sets a price from a percentage, and typing a price has to put the handle
 * back in the right place. Every function here therefore has an exact inverse
 * in this file, and `tpsl.test.ts` asserts the round trip rather than trusting
 * that two separately-written formulas agree.
 *
 * Nothing here reads a store, calls an exchange or rounds for display. It is
 * arithmetic over `Decimal`, so it can be tested without mounting anything.
 * Tick-size rounding is `roundToTick`, applied by the caller at commit time —
 * keeping it out of the formulas is what lets a round trip stay exact.
 *
 * ## Sign convention
 *
 * Every mode takes a **signed** value where **positive means favourable** for
 * the position: a take-profit is a positive ROI, a stop-loss is a negative
 * one. The side (long/short) then decides which direction on the price axis
 * that is. This is deliberately one axis rather than two: a "TP mode" and an
 * "SL mode" with their own formulas is four code paths where the sign is
 * flipped in three of them, and a sign error in TP/SL arithmetic puts a stop
 * on the wrong side of entry.
 */

import { Decimal } from "decimal.js";

export type PositionSide = "LONG" | "SHORT";

/**
 * Everything the three modes need about the position being protected.
 *
 * Not every field is used by every mode — Change needs only `entryPrice`, ROI
 * adds `leverage`, PnL adds `positionSize`. They travel together because the
 * component switching between modes has all of them anyway, and a per-mode
 * argument list is how a caller ends up passing leverage where size belongs.
 */
export interface TpSlContext {
    /** Average entry price of the position the plan protects. */
    entryPrice: Decimal;
    /** Leverage the position runs at. Used by ROI mode. */
    leverage: Decimal;
    /** Which way the position faces — decides the sign of every mode. */
    side: PositionSide;
    /** Position size in base units (contracts). Used by PnL mode. */
    positionSize: Decimal;
}

/** +1 for a long, -1 for a short. */
function direction(side: PositionSide): Decimal {
    return side === "LONG" ? new Decimal(1) : new Decimal(-1);
}

/* ------------------------------------------------------------------ *
 * Change mode — percentage move of the raw price. Leverage-independent.
 * ------------------------------------------------------------------ */

/**
 * `changePercent` is signed and favourable-positive: +5 on a long is a price
 * 5% above entry, +5 on a short is a price 5% *below* it.
 */
export function priceFromChangePercent(
    ctx: TpSlContext,
    changePercent: Decimal,
): Decimal {
    const move = changePercent.div(100).times(direction(ctx.side));
    return ctx.entryPrice.times(new Decimal(1).plus(move));
}

/** Exact inverse of {@link priceFromChangePercent}. */
export function changePercentFromPrice(
    ctx: TpSlContext,
    price: Decimal,
): Decimal {
    if (ctx.entryPrice.lte(0)) return new Decimal(0);
    return price
        .minus(ctx.entryPrice)
        .div(ctx.entryPrice)
        .times(direction(ctx.side))
        .times(100);
}

/* ------------------------------------------------------------------ *
 * ROI mode — return on the margin actually posted, so leverage multiplies it.
 *
 *   PnL    = size × (price − entry) × dir
 *   margin = size × entry / leverage
 *   ROI    = PnL / margin = (price − entry) × dir × leverage / entry
 *
 * Size cancels, which is why this mode does not need `positionSize`: a 10%
 * ROI is the same trigger price whether the position is one contract or a
 * thousand.
 * ------------------------------------------------------------------ */

/**
 * `roiPercent` is signed and favourable-positive. At 10x leverage a +100 ROI
 * on a long entered at 100 is a trigger at 110 — the margin doubles, not the
 * price.
 */
export function priceFromRoiPercent(
    ctx: TpSlContext,
    roiPercent: Decimal,
): Decimal {
    if (ctx.leverage.lte(0)) return ctx.entryPrice;
    const move = roiPercent.div(100).div(ctx.leverage).times(direction(ctx.side));
    return ctx.entryPrice.times(new Decimal(1).plus(move));
}

/** Exact inverse of {@link priceFromRoiPercent}. */
export function roiPercentFromPrice(
    ctx: TpSlContext,
    price: Decimal,
): Decimal {
    if (ctx.entryPrice.lte(0)) return new Decimal(0);
    return price
        .minus(ctx.entryPrice)
        .div(ctx.entryPrice)
        .times(ctx.leverage)
        .times(direction(ctx.side))
        .times(100);
}

/* ------------------------------------------------------------------ *
 * PnL mode — an absolute quote-currency amount, matching the reference UI's
 * "Profit" / "Loss" field (IDEA-0199 §1.2). Unlike the two above this one
 * scales with position size, so it needs `positionSize` and is meaningless
 * without it.
 * ------------------------------------------------------------------ */

/**
 * `pnlAmount` is signed and favourable-positive, in quote currency (USDT).
 *
 * Returns `entryPrice` unchanged when the position has no size — there is no
 * price at which a zero-size position makes 50 USDT, and returning entry is
 * the answer that leaves the slider where it was rather than sending it to
 * infinity.
 */
export function priceFromPnl(ctx: TpSlContext, pnlAmount: Decimal): Decimal {
    if (ctx.positionSize.lte(0)) return ctx.entryPrice;
    const move = pnlAmount.div(ctx.positionSize).times(direction(ctx.side));
    return ctx.entryPrice.plus(move);
}

/** Exact inverse of {@link priceFromPnl}. */
export function pnlFromPrice(ctx: TpSlContext, price: Decimal): Decimal {
    return price.minus(ctx.entryPrice).times(ctx.positionSize).times(direction(ctx.side));
}

/* ------------------------------------------------------------------ *
 * Tick-size rounding — applied by the caller, not by the formulas.
 * ------------------------------------------------------------------ */

/**
 * Snaps a price to the instrument's tick size.
 *
 * Deliberately *not* called inside the formulas above: rounding there would
 * break the round trip the component depends on (drag → price → percent →
 * handle position), and would round twice when a caller chains modes. The
 * component applies this once, at the point the value is displayed and
 * submitted.
 *
 * Rounds to nearest rather than away from entry. Away-from-entry would be
 * "safer" for a stop by at most one tick and is what a trader who set an
 * exact round number would then not see back on screen; the exchange rounds
 * to nearest too, so nearest is also what actually gets filled.
 */
export function roundToTick(price: Decimal, tickSize: Decimal): Decimal {
    if (tickSize.lte(0)) return price;
    return price.div(tickSize).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(tickSize);
}

/* ------------------------------------------------------------------ *
 * Fee treatment — OPEN, see FEAT-0254's open questions.
 * ------------------------------------------------------------------ */

/**
 * Gross ROI, as computed by {@link roiPercentFromPrice}, ignores trading fees.
 * `calculateIndividualTp` in `core.ts` does not: its `returnOnCapital` is
 * derived from `netProfit`, which subtracts both the entry and the exit fee.
 *
 * So a trader who drags this slider to "+100% ROI" and then reads the
 * calculator panel next to it sees something slightly under 100 — the same
 * number, computed two ways, disagreeing on screen. That is the class of
 * inconsistency BUG-0252 was about on the margin side.
 *
 * TODO(FEAT-0254): decide gross vs net and implement here. Both are
 * defensible:
 *
 *   - **Gross** (current behaviour) — the slider says what the price does.
 *     Simple, exactly invertible, and independent of a fee rate the app may
 *     not know for the active account's tier.
 *   - **Net** — the slider says what the trader actually keeps, and agrees
 *     with the panel. Needs `feePercent` in `TpSlContext`, and the inverse
 *     stops being a one-liner because the exit fee depends on the exit price
 *     being solved for.
 *
 * Net, solved for a long:
 *
 *     netPnL = size × (P − E) − size × E × f − size × P × f
 *            = size × [ P(1 − f) − E(1 + f) ]
 *     ⇒  P   = [ netPnL / size + E(1 + f) ] / (1 − f)
 *
 * where `f` is the fee rate as a fraction (`feePercent / 100`).
 */
