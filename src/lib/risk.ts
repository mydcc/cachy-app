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
import { parseDecimal } from "../utils/utils";

/**
 * The risk lens: one source of truth per lock mode, everything else derived.
 *
 * The store holds the side the trader actually edits — the risk percentage
 * when unlocked, the risk amount when the amount is locked, neither when the
 * position size is locked — plus the lock flags. Whatever is not the edited
 * side is a pure function of the inputs below, computed here instead of
 * written back into the store by the calculation. That write-back used to be
 * the trigger loop the calculator throttle guarded; with the lens there is
 * no write-back left, so no loop can form.
 *
 * The branch structure mirrors `CalculatorService.performCalculation`
 * exactly, including its zero guards and its precedence: when both locks are
 * somehow set (the toggles enforce mutual exclusion, but a restored snapshot
 * can carry both), the amount lock wins on both sides, so the fields, the
 * watcher key and the figures cannot disagree. If a branch changes there, it
 * must change here — the unit tests pin both sides to the same table.
 */
export interface RiskSource {
  accountSize: string | null | undefined;
  riskPercentage: string | null | undefined;
  riskAmount: string | null | undefined;
  isRiskAmountLocked: boolean;
  isPositionSizeLocked: boolean;
  lockedPositionSize: Decimal | string | number | null | undefined;
  entryPrice: string | null | undefined;
  stopLossPrice: string | null | undefined;
}

function lockedSize(source: RiskSource): Decimal | null {
  const size = parseDecimal(source.lockedPositionSize);
  return size.gt(0) ? size : null;
}

function riskPerUnit(source: RiskSource): Decimal | null {
  const distance = parseDecimal(source.entryPrice)
    .minus(parseDecimal(source.stopLossPrice))
    .abs();
  return distance.gt(0) ? distance : null;
}

/**
 * The risk amount the trade is sized against. In amount-locked mode that is
 * the stored amount itself; in position-size-locked mode it follows from the
 * locked size and the stop distance; otherwise from account and percentage.
 */
export function effectiveRiskAmount(source: RiskSource): Decimal {
  if (source.isRiskAmountLocked) {
    return parseDecimal(source.riskAmount);
  }
  if (source.isPositionSizeLocked) {
    const size = lockedSize(source);
    const perUnit = size === null ? null : riskPerUnit(source);
    if (size !== null && perUnit !== null) return perUnit.times(size);
  }
  return parseDecimal(source.accountSize).times(
    parseDecimal(source.riskPercentage).div(100),
  );
}

/**
 * The risk percentage the trade is sized against. In amount-locked mode it
 * follows from the amount and the account; in position-size-locked mode from
 * the locked size, the stop distance and the account; otherwise it is the
 * stored percentage itself.
 */
export function effectiveRiskPercentage(source: RiskSource): Decimal {
  if (source.isRiskAmountLocked) {
    const amount = parseDecimal(source.riskAmount);
    const account = parseDecimal(source.accountSize);
    if (amount.gt(0) && account.gt(0)) return amount.div(account).times(100);
  } else if (source.isPositionSizeLocked) {
    const size = lockedSize(source);
    const perUnit = size === null ? null : riskPerUnit(source);
    if (size !== null && perUnit !== null) {
      const account = parseDecimal(source.accountSize);
      if (account.isZero()) return new Decimal(0);
      return perUnit.times(size).div(account).times(100);
    }
  }
  return parseDecimal(source.riskPercentage);
}
