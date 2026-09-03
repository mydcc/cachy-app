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

/**
 * FEAT-0253, decision 1 — the broker's own fills are the source of truth for
 * the account's fee rate.
 *
 * There is no fee-tariff endpoint on Bitunix (verified against the live API
 * docs navigation: Account, Common, CopyTrading, ErrorCode, Market, Position,
 * Tp sl, Trade, Websocket — no fee, commission or VIP-tier route anywhere).
 * What *is* reachable is the amount actually charged, per fill:
 * `GET /api/v1/futures/trade/get_history_trades` returns `fee`, `roleType`
 * (`MAKER`/`TAKER`), `price` and `qty` on every trade record
 * (`docs/bitunix-api/07_trade.md:336`).
 *
 * So the effective rate is
 *
 *     rate = fee / (price × qty)     grouped by roleType
 *
 * which is not an estimate — it is what the broker took. It carries the
 * account's VIP tier, promotions and discounts automatically, which is why the
 * user never enters a VIP level: the number already contains it.
 */

import { Decimal } from "decimal.js";

export type FeeRole = "maker" | "taker";

/**
 * One trade record as the exchange returns it. Every field is `unknown`
 * because this crosses the network boundary — the shape is validated here,
 * not assumed. Extra fields the venue sends are ignored.
 */
export interface RawFill {
  fee?: unknown;
  price?: unknown;
  qty?: unknown;
  roleType?: unknown;
  [key: string]: unknown;
}

export interface DerivedFeeRate {
  /**
   * The effective rate as a PERCENTAGE — `0.06` means 0.06%, the same unit as
   * `CONSTANTS.DEFAULT_FEES` and `settingsState.feeRates`. The fraction from
   * `fee / (price × qty)` is multiplied by 100 exactly once, here, and never
   * again downstream (BUG-0329 is what the unit confusion costs).
   */
  rate: Decimal;
  /** How many usable fills backed this rate. Never zero when a rate exists. */
  sampleCount: number;
}

export interface DerivedFeeRates {
  maker?: DerivedFeeRate;
  taker?: DerivedFeeRate;
  /** Fills that could not be used at all (unparseable, or zero notional). */
  skipped: number;
}

/**
 * Strict numeric parse for values that crossed the network. Unlike
 * `parseDecimal` in `utils.ts`, absence is *not* silently zero: a missing or
 * unparseable field returns `null` so the caller can skip the fill rather than
 * fold a fabricated 0 into the estimate.
 */
export function toDecimalOrNull(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Decimal) return value.isFinite() ? value : null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Decimal(value) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    const parsed = new Decimal(trimmed);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function toRole(value: unknown): FeeRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "MAKER") return "maker";
  if (normalized === "TAKER") return "taker";
  return null;
}

/**
 * Median rather than mean, deliberately.
 *
 * Discount tokens, bonus balances and coupons distort an individual fill's
 * implied rate; a mean lets one such fill drag the whole estimate, a median
 * does not. The value returned is always one the broker actually charged —
 * never an average of two, which would be a rate it never did.
 *
 * On an even sample count that leaves a choice between the two middle values,
 * and it takes the **upper** one. Consider an account with two fills, one at
 * the standard rate and one fully covered by a promotion: sorted, that is
 * `[0, 0.06]`, and picking the lower would have the app conclude this account
 * trades for free. Every other hazard here is guarded against exactly that
 * conclusion, so the tie-break has to agree with them.
 */
function median(values: Decimal[]): Decimal {
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  return sorted[Math.ceil((sorted.length - 1) / 2)];
}

/**
 * Fee tariffs are quoted to four decimal places at most (`0.0600` = 0.06%).
 * A rate divided out of a satoshi-rounded fee carries twenty significant
 * digits of noise past that, which would render as an unreadable string in a
 * field sized for six characters — and, worse, would present arithmetic
 * artefacts as if they were precision the exchange had stated.
 */
const RATE_DECIMAL_PLACES = 4;

/**
 * Derive the account's effective maker and taker rates from its own fills.
 *
 * Hazards handled explicitly (FEAT-0253, "Known hazards for the derivation"):
 *
 * - **No fills**: the role is absent from the result. It is never reported as
 *   a rate of zero — a zero-fee account is a lie that understates risk.
 * - **Maker rebates**: a negative `fee` keeps its sign. Some venues pay makers;
 *   `.abs()` on the fee here would turn a credit into a charge.
 * - **Zero notional**: `price × qty === 0` would divide by zero, so the fill is
 *   counted in `skipped` instead.
 * - **A single distorted fill**: the median over the role's fills absorbs it.
 * - `decimal.js` throughout, never `parseFloat`.
 */
export function deriveFeeRatesFromFills(
  fills: readonly RawFill[] | null | undefined,
): DerivedFeeRates {
  const buckets: Record<FeeRole, Decimal[]> = { maker: [], taker: [] };
  let skipped = 0;

  for (const fill of fills ?? []) {
    if (!fill || typeof fill !== "object") {
      skipped += 1;
      continue;
    }
    const role = toRole(fill.roleType);
    const fee = toDecimalOrNull(fill.fee);
    const price = toDecimalOrNull(fill.price);
    const qty = toDecimalOrNull(fill.qty);

    if (role === null || fee === null || price === null || qty === null) {
      skipped += 1;
      continue;
    }

    const notional = price.times(qty);
    if (notional.isZero()) {
      skipped += 1;
      continue;
    }

    // Multiply by 100 exactly once — the value is a percentage from here on.
    // The notional is taken absolute so the rate's sign means "rebate" and
    // nothing else; a venue reporting a signed quantity must not flip it.
    buckets[role].push(
      fee
        .div(notional.abs())
        .times(100)
        .toDecimalPlaces(RATE_DECIMAL_PLACES, Decimal.ROUND_HALF_UP),
    );
  }

  const result: DerivedFeeRates = { skipped };
  for (const role of ["maker", "taker"] as const) {
    const samples = buckets[role];
    if (samples.length > 0) {
      result[role] = { rate: median(samples), sampleCount: samples.length };
    }
  }
  return result;
}
