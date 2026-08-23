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
 * Fees — forward only, on purpose.
 *
 * Everything above is gross, and gross is what drives the slider: a trigger
 * is a *price*, and the price a trader dials in must be the price the
 * exchange gets. The functions below say what that price is actually worth
 * after fees, for display beside it.
 *
 * There is deliberately no inverse here. Making a net figure *drive* the
 * slider would put a hand-estimated fee rate into the order itself — a wrong
 * guess would move real money. As a readout, a wrong guess costs one line of
 * information. Errors should degrade what is shown, not what is sent.
 *
 * The rate is also genuinely uncertain in a way that has nothing to do with
 * the account's tier: a take-profit resting as a limit order pays maker, the
 * same position closed early at market pays taker (0.014% vs 0.042% on
 * Bitunix — a factor of three), and which one happens is not known when the
 * plan is set. So this is an estimate under a stated assumption, and belongs
 * where an estimate belongs.
 * ------------------------------------------------------------------ */

/**
 * The two legs are separate rates because they genuinely are: entry is
 * decided by the order type that opened the position, exit by how it ends.
 *
 * `core.ts` currently applies one rate to both (`values.fees`), and the trade
 * panel only carries one — `tradeState.feeMode` is `"maker_taker" | "flat"`
 * while the journal's own `feeMode` covers all four combinations, and
 * `remoteMakerFee`/`remoteTakerFee` are declared but never assigned by
 * anything. Modelling both legs here means the call site is the only thing
 * that changes when the panel catches up, rather than this arithmetic.
 *
 * Both are percentages, matching `values.fees` — `0.014` means 0.014%, not
 * 1.4%.
 */
export interface FeeRates {
    entryPercent: Decimal;
    exitPercent: Decimal;
}

/**
 * Gross PnL less both legs' fees, each charged on the notional it is actually
 * traded at — entry fee on entry notional, exit fee on exit notional. Same
 * convention as `calculateIndividualTp`, so the two agree.
 */
export function netPnlFromPrice(
    ctx: TpSlContext,
    price: Decimal,
    fees: FeeRates,
): Decimal {
    const gross = pnlFromPrice(ctx, price);
    const entryFee = ctx.positionSize.times(ctx.entryPrice).times(fees.entryPercent.div(100));
    const exitFee = ctx.positionSize.times(price).times(fees.exitPercent.div(100));
    return gross.minus(entryFee).minus(exitFee);
}

/**
 * {@link netPnlFromPrice} as a return on the posted margin — the net
 * counterpart of {@link roiPercentFromPrice}, and the same quantity
 * `calculateIndividualTp` reports as `returnOnCapital`.
 */
export function netRoiPercentFromPrice(
    ctx: TpSlContext,
    price: Decimal,
    fees: FeeRates,
): Decimal {
    if (ctx.entryPrice.lte(0) || ctx.positionSize.lte(0) || ctx.leverage.lte(0)) {
        return new Decimal(0);
    }
    const margin = ctx.positionSize.times(ctx.entryPrice).div(ctx.leverage);
    if (margin.lte(0)) return new Decimal(0);
    return netPnlFromPrice(ctx, price, fees).div(margin).times(100);
}
