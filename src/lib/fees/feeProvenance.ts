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
 * FEAT-0253, decision 2 — where a displayed fee rate came from, and the order
 * in which candidate sources win.
 *
 * | Source                        | Shown as             | When                       |
 * | ----------------------------- | -------------------- | -------------------------- |
 * | Derived from the broker fills | "from broker"        | a fill of that role exists |
 * | Venue default (VIP 0)         | "assumed — no fills" | fresh account, role unseen |
 * | User-entered value            | "manual"             | paper trading, or override |
 *
 * The rule the whole feature rests on: **a number the broker never sent must
 * never be labelled as coming from the broker.** Provenance is not decoration;
 * it is what separates a quote from a guess in a tool that sizes real money.
 */

import { Decimal } from "decimal.js";
import type { FeeRole, DerivedFeeRates } from "./deriveFeeRates";

export type FeeProvenance = "broker" | "assumed" | "manual";

export interface ResolvedFeeRate {
  /** Percentage, e.g. `0.06` for 0.06% — same unit throughout the app. */
  rate: Decimal;
  /**
   * The rate exactly as its source expressed it. A Settings value keeps the
   * user's own formatting — someone who typed `0.0600` sees `0.0600` back,
   * not a `Decimal`-normalised `0.06`. Silently reformatting what a user typed
   * makes them doubt whether the field took their input at all.
   */
  display: string;
  provenance: FeeProvenance;
  /** Fills behind a `"broker"` rate; `undefined` for the other two. */
  sampleCount?: number;
}

export interface FeeRateSources {
  /** Rates derived from this account's own fills, if any were derivable. */
  derived?: DerivedFeeRates;
  /** What Settings currently holds for this venue and role (a percentage). */
  settingsRate: Decimal;
  /** That same Settings value as the user typed it, for display. */
  settingsDisplay?: string;
  /** The documented venue default for this role (`VENUE_DEFAULT_FEE_RATES`). */
  venueDefault: Decimal;
  /**
   * Paper trading has no broker, so a derived rate — even a stale one left in
   * the store by an earlier live session — must not be presented as this
   * account's.
   */
  isPaperTrading: boolean;
}

/**
 * Pick the rate for one role and say honestly where it came from.
 *
 * A broker-derived rate wins whenever one exists and a broker is actually in
 * play, mirroring how `remoteLeverage` overrides the local leverage since
 * FEAT-0328: when the venue has told us what it charges, the planning tool
 * plans with that number rather than with a wish.
 *
 * Otherwise Settings supplies the number, and the label distinguishes a value
 * the user deliberately chose (`"manual"`) from one they merely never changed
 * (`"assumed"`) — an untouched prefill is a documented VIP-0 tariff, not a
 * statement about this account.
 */
export function resolveFeeRate(
  role: FeeRole,
  sources: FeeRateSources,
): ResolvedFeeRate {
  const { derived, settingsRate, settingsDisplay, venueDefault, isPaperTrading } =
    sources;

  const brokerRate = isPaperTrading ? undefined : derived?.[role];
  if (brokerRate) {
    return {
      rate: brokerRate.rate,
      display: brokerRate.rate.toString(),
      provenance: "broker",
      sampleCount: brokerRate.sampleCount,
    };
  }

  return {
    rate: settingsRate,
    display: settingsDisplay ?? settingsRate.toString(),
    // `.equals` and not `===`: "0.0600" and "0.06" are the same tariff, and a
    // user who retyped the default has not thereby made a personal choice.
    provenance: settingsRate.equals(venueDefault) ? "assumed" : "manual",
  };
}

/**
 * Rebuild a `DerivedFeeRates` from the flat fields the trade store keeps.
 *
 * The store holds the two rates and their sample counts separately because
 * that is what a Svelte rune store can hold cheaply; `resolveFeeRate` wants
 * them as one value. Returns `undefined` when neither role was derived, so a
 * caller can pass it straight through without a second emptiness check.
 */
export function derivedRatesFromStore(
  makerRate: Decimal | undefined,
  takerRate: Decimal | undefined,
  samples: { maker?: number; taker?: number } | undefined,
): DerivedFeeRates | undefined {
  if (!makerRate && !takerRate) return undefined;
  return {
    maker: makerRate
      ? { rate: makerRate, sampleCount: samples?.maker ?? 0 }
      : undefined,
    taker: takerRate
      ? { rate: takerRate, sampleCount: samples?.taker ?? 0 }
      : undefined,
    skipped: 0,
  };
}

/**
 * Which role the entry leg pays (FEAT-0253, decision 3).
 *
 * Entry follows the order type Cachy actually holds. Only a resting limit
 * order adds liquidity, so only it is a maker fill; a market order and a
 * trigger order — which is a conditional market order, taking liquidity the
 * moment it fires — are both taker fills. The default arm is taker rather than
 * maker on purpose: a new order type added to `OrderEntryType` later will be
 * charged the expensive rate until someone decides otherwise, which is the
 * safe direction for a tool that sizes real positions.
 *
 * The exit leg is not covered here. It is genuinely unknowable when the plan
 * is made (ADR-0010: "decided after the fact"), so it follows the user's
 * declared assumption instead, defaulting to taker for the same reason.
 */
export function entryRoleForOrderType(
  orderType: "market" | "limit" | "trigger",
): FeeRole {
  return orderType === "limit" ? "maker" : "taker";
}
