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
 * FEAT-0395 — turning a click on the chart into a price condition.
 *
 * Kept out of `CandleChartView.svelte` deliberately: this is the only part of
 * the chart entry point with a decision in it, and a decision that reaches a
 * rule document is one that has to be testable without a canvas, a WebGL
 * context and a live socket.
 *
 * It produces the same `cross` condition the Price tab (FEAT-0390) builds by
 * hand, so a right-clicked alarm and a typed one are the same document — same
 * shape, same content hash, same sentence in the footer.
 */

import Decimal from "decimal.js";
import type {
  Condition,
  PriceField,
  PriceSource,
  TimeframeString,
} from "../rules/types";

export interface ChartAlertSeedInput {
  /** The price under the cursor, from the series' own coordinate conversion. */
  clickedPrice: number;
  /** The last traded price, to decide which side of it the level is on. */
  lastPrice: number | null;
  /** Decimals the price axis is showing, so the level matches what was read. */
  decimals: number;
  timeframe: TimeframeString;
  field: PriceField;
  source: PriceSource;
}

/**
 * The chart's timeframe in the spelling a rule document accepts, or `null`.
 *
 * `TimeframeString` is `<positive integer><m|h|d|w>` — which the chart's own
 * list mostly satisfies, but not `1M`: a month is not in that alphabet, and
 * seeding it would produce a rule the core refuses with a message about a
 * field the trader never filled in. `null` means "no opinion", and the caller
 * falls back to the panel's default rather than passing the refusal on.
 */
export function ruleTimeframeFor(chartTimeframe: string): TimeframeString | null {
  return /^[1-9]\d*[mhdw]$/.test(chartTimeframe) ? chartTimeframe : null;
}

/**
 * Which way a level has to be crossed to be worth arming.
 *
 * A level above the current price is one the price has to *rise* to; one below
 * it is one it has to *fall* to. Choosing by position rather than asking is
 * the point of the feature — the trader already expressed the direction by
 * where they clicked.
 *
 * On a tie — a click that rounds onto the current price — this answers
 * `above`. Both readings are defensible and neither is silent: the footer
 * sentence spells the direction out, and the radio group in the Price tab is
 * one click from the other one.
 */
export function crossDirectionFor(
  clickedPrice: Decimal,
  lastPrice: Decimal | null,
): "above" | "below" {
  if (lastPrice === null) return "above";
  return clickedPrice.lt(lastPrice) ? "below" : "above";
}

/**
 * A decimal as plain digits, never exponential.
 *
 * Same rule as the Price tab: `toString()` switches to `1.2e-7` for small
 * prices, and that spelling would travel into the document and its content
 * hash. `toFixed()` with no argument keeps the exact value in normal notation.
 */
function plainDecimal(value: Decimal): string {
  return value.toFixed();
}

/**
 * The condition a click at `clickedPrice` describes, or `null` when the click
 * cannot become a level at all.
 *
 * Rounded to the axis precision first: the trader armed the number they read
 * off the scale, not the 14 digits a pixel-to-price conversion happens to
 * produce. Rounding before the sign check also means a click that rounds onto
 * zero is refused rather than armed as a level nothing crosses.
 */
export function conditionFromChartClick(
  input: ChartAlertSeedInput,
): Condition | null {
  if (!Number.isFinite(input.clickedPrice)) return null;

  const decimals =
    Number.isInteger(input.decimals) && input.decimals >= 0
      ? input.decimals
      : 2;
  const level = new Decimal(input.clickedPrice).toDecimalPlaces(
    decimals,
    Decimal.ROUND_HALF_UP,
  );
  if (!level.isFinite() || level.lte(0)) return null;

  const last =
    input.lastPrice !== null && Number.isFinite(input.lastPrice)
      ? new Decimal(input.lastPrice)
      : null;

  // `source` is omitted for the last series so the document serialises exactly
  // as it did before that field existed — the same omission the Price tab
  // makes, and what keeps both paths on one content hash.
  const seriesPart = input.source === "mark" ? { source: input.source } : {};

  return {
    kind: "cross",
    left: { kind: "price", field: input.field, ...seriesPart },
    direction: crossDirectionFor(level, last),
    right: { kind: "constant", value: plainDecimal(level) },
    timeframe: input.timeframe,
  };
}
