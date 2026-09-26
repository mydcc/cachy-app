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

/*
 * BUG-0559 — estimated 24h funding cash flow with position-side sign.
 *
 * Funding-rate sign convention: a positive rate means longs pay shorts.
 * The unsigned estimate (notional x average rate x settlements per day)
 * therefore reads as a cost for a long and as income for a short; a
 * negative rate mirrors it. This module applies the planned trade
 * direction so the display never shows a short "paying" a positive rate
 * it would actually receive.
 *
 * Pure Decimal math, no store access — the caller supplies notional,
 * average rate, interval and side, which keeps the sign matrix unit
 * testable without mounting a component.
 */

import { Decimal } from "decimal.js";
import { isTradeDirection, normalizeTradeDirection } from "./tradeDirection";

/**
 * Signed 24h funding cash flow from the trader's perspective: positive is
 * a cost (trader pays), negative is income (trader receives).
 *
 * @param notional position notional in quote currency (must be positive)
 * @param avgRate average funding rate per settlement (signed Decimal)
 * @param fundingIntervalHours hours between settlements (e.g. 8, 4, 1)
 * @param tradeType planned direction ("long" | "short")
 * @returns `null` when the interval is unusable (0, negative or not a finite
 *   number). Dividing by such an interval yields an infinite display value
 *   ("+Infinity USDT") rather than throwing, so the caller must treat `null`
 *   as "no estimate" and hide the row.
 */
export function signedFundingCashFlow24h(
  notional: Decimal,
  avgRate: Decimal,
  fundingIntervalHours: number,
  tradeType: string,
): Decimal | null {
  const normalizedTradeType = normalizeTradeDirection(tradeType);
  if (!isTradeDirection(normalizedTradeType)) {
    return null;
  }
  if (!Number.isFinite(fundingIntervalHours) || fundingIntervalHours <= 0) {
    return null;
  }
  const settlementsPerDay = new Decimal(24).dividedBy(fundingIntervalHours);
  const unsigned = notional.times(avgRate).times(settlementsPerDay);
  return normalizedTradeType === "short" ? unsigned.negated() : unsigned;
}
