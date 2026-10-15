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

import { Decimal } from "decimal.js";
import { parseDecimal } from "./utils";
import { effectiveRiskPercentage } from "../lib/risk";

/**
 * BUG-0648 — one predicate for "the form no longer states what the last
 * successful calculation holds", shared by every consumer of
 * `currentTradeData`.
 *
 * The order panel derived this inline and the journal path (`app.addTrade`)
 * did not check at all, so a cleared stop left the order refused but the
 * journal willing to record the same stale figures. Both now read this:
 * the panel for its note and its submit refusal, the journal for refusing a
 * stale record. A single source so the two can never disagree on what counts
 * as stale.
 *
 * Structural types on purpose: the panel passes live store objects (and
 * partial mocks in tests), the journal passes a snapshot. Both shapes fit
 * without importing the store layer.
 */
export interface StatedCalculation {
  stopLossPrice?: Decimal | null;
  entryPrice?: Decimal | null;
  leverage?: Decimal | null;
  accountSize?: Decimal | null;
  riskPercentage?: Decimal | null;
  targets?: ReadonlyArray<{ price?: string | Decimal | null }>;
  symbol?: string;
  tradeType?: string;
}

export interface StatedForm {
  stopLossPrice?: string | null;
  entryPrice?: string | null;
  leverage?: string | null;
  accountSize?: string | null;
  riskPercentage?: string | null;
  targets?: ReadonlyArray<{ price?: string | Decimal | null }>;
  symbol?: string;
  tradeType?: string;
  useAtrSl?: boolean;
  /**
   * The risk lens (`lib/risk.ts`): the stored percentage is the edited side
   * only in unlocked mode. In locked modes it is stale by design — the
   * calculation never writes it back — so the comparison below reads the
   * effective percentage through the same lens instead of the raw string.
   * All optional so partial mocks keep comparing raw values.
   */
  riskAmount?: string | null;
  isRiskAmountLocked?: boolean;
  isPositionSizeLocked?: boolean;
  lockedPositionSize?: Decimal | string | number | null;
}

export interface CalculationStaleness {
  /** Any input the calculation consumed no longer matches the form. */
  stale: boolean;
  /** The stop alone disagrees. */
  stopDisagrees: boolean;
  /** Any non-stop input disagrees. */
  restDisagrees: boolean;
  /**
   * The stop was cleared (or zeroed) while the calculation still holds a
   * positive one, and nothing else disagrees. Narrow on purpose: this is the
   * one stale cause the gate itself prescribes (`orderGate.unplaceableStop`),
   * and the calculator cannot follow it there — `getAndValidateInputs`
   * returns `STATUS_INCOMPLETE` for a non-positive stop, so no recalculation
   * replaces the figures. Outside ATR mode only (there the field is not the
   * stop's source). `undefined` is not a claim, so a missing field never
   * reads as a withdrawal.
   */
  stopCleared: boolean;
}

/**
 * The delta the calculator itself treats as "did not change"
 * (`calculatorService.ts:429`). Named so the two cannot drift apart quietly.
 */
const UNPERSISTED_PRICE_DELTA = new Decimal("0.000001");

/**
 * A level the trader has stated, or `null` for none.
 *
 * `parseDecimal`, not the raw constructor: form fields carry no numeric
 * refine, so any string can reach this, and a throw inside a `$derived`
 * breaks the panel on every re-evaluation. `parseDecimal` never throws —
 * garbage maps to `Decimal(0)`, which reads as absent below.
 */
function positiveDecimal(
  value: Decimal | string | null | undefined,
): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Decimal ? value : parseDecimal(value);
  return parsed.isFinite() && parsed.gt(0) ? parsed : null;
}

/*
 * `undefined` means the store states nothing here, which is not the same as
 * stating "cleared": an empty field is a claim, a missing field is not one.
 * Form fields are `string | null` in production and never undefined, so the
 * branch changes no runtime behaviour — it stops a partial test mock from
 * reading as a withdrawal.
 */
function stated(value: string | null | undefined): string | null {
  return value === undefined ? null : value;
}

/*
 * The calculator skips the store write-back when the derived stop moved
 * less than the delta above and assigns `currentTradeData` regardless — so
 * the calculation can hold a stop the store never received. Comparing
 * exactly would refuse that order forever, with no input that helps. Same
 * tolerance, so "agree" means what the calculator meant by "changed".
 */
function priceAgrees(
  calculated: Decimal | null | undefined,
  value: string | Decimal | null | undefined,
): boolean {
  const claim = stated(value as string | null | undefined);
  if (claim === null) return true;
  const fromCalculation = positiveDecimal(calculated);
  const fromInput = positiveDecimal(claim);
  if (fromCalculation === null && fromInput === null) return true;
  if (fromCalculation === null || fromInput === null) return false;
  return fromCalculation.minus(fromInput).abs().lte(UNPERSISTED_PRICE_DELTA);
}

/*
 * Scalars are different: zero is a value here, not an absence, and an empty
 * one is not a trader statement at all — an empty leverage makes the
 * calculator substitute `DEFAULT_LEVERAGE`, which is exactly the source it
 * read, so comparing that against zero would refuse every order until the
 * trader typed a leverage they never wanted to change. Skip the empty case
 * and compare the rest for what it is.
 */
function scalarAgrees(
  calculated: Decimal | null | undefined,
  value: string | null | undefined,
): boolean {
  const claim = stated(value);
  if (claim === null || claim === "") return true;
  if (calculated === null || calculated === undefined) return false;
  return calculated.isFinite() && calculated.eq(parseDecimal(claim));
}

/*
 * Take-profit legs travel with the order, so a leg the trader deleted or
 * reordered has to count as stale too — same rule as the stop, per leg.
 * Order is part of what gets sent, not a cosmetic detail.
 */
function legsAgree(
  calculated: ReadonlyArray<{ price?: string | Decimal | null }> | undefined,
  form: ReadonlyArray<{ price?: string | Decimal | null }> | undefined,
): boolean {
  if (form === undefined) return true;
  const calculatedLegs = (calculated ?? []).map((t) => positiveDecimal(t.price));
  const inputLegs = form.map((t) => t.price);
  return (
    calculatedLegs.length === inputLegs.length &&
    calculatedLegs.every((leg, index) => priceAgrees(leg, inputLegs[index]))
  );
}

export function describeStaleness(
  calculated: StatedCalculation | null | undefined,
  form: StatedForm,
): CalculationStaleness {
  if (!calculated) {
    return { stale: false, stopDisagrees: false, restDisagrees: false, stopCleared: false };
  }
  const stopDisagrees = !priceAgrees(
    calculated.stopLossPrice,
    form.stopLossPrice,
  );
  /*
   * The lens needs something to read: when the form states neither side of
   * the pair, that is not a claim (same rule `scalarAgrees` applies to a
   * missing field), so compare raw and agree. Real callers always carry both
   * strings; only partial test mocks hit the missing branch.
   */
  const riskAgrees =
    form.riskPercentage === undefined && form.riskAmount === undefined
      ? scalarAgrees(calculated.riskPercentage, form.riskPercentage)
      : scalarAgrees(
          calculated.riskPercentage,
          effectiveRiskPercentage({
            accountSize: form.accountSize,
            riskPercentage: form.riskPercentage,
            riskAmount: form.riskAmount,
            isRiskAmountLocked: form.isRiskAmountLocked ?? false,
            isPositionSizeLocked: form.isPositionSizeLocked ?? false,
            lockedPositionSize: form.lockedPositionSize,
            entryPrice: form.entryPrice,
            stopLossPrice: form.stopLossPrice,
          }).toString(),
        );
  const restDisagrees =
    !priceAgrees(calculated.entryPrice, form.entryPrice) ||
    !scalarAgrees(calculated.leverage, form.leverage) ||
    !scalarAgrees(calculated.accountSize, form.accountSize) ||
    !riskAgrees ||
    !legsAgree(calculated.targets, form.targets) ||
    (form.symbol !== undefined && calculated.symbol !== form.symbol) ||
    (form.tradeType !== undefined && calculated.tradeType !== form.tradeType);
  const stopCleared =
    stopDisagrees &&
    !restDisagrees &&
    form.stopLossPrice !== undefined &&
    form.useAtrSl !== true &&
    positiveDecimal(calculated.stopLossPrice) !== null &&
    positiveDecimal(form.stopLossPrice) === null;
  return {
    stale: stopDisagrees || restDisagrees,
    stopDisagrees,
    restDisagrees,
    stopCleared,
  };
}
