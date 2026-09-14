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

import type { IndicatorRef, PriceField } from "./types";

/**
 * The registry identities the alert path can compute (BUG-0451).
 *
 * One list with two readers. `computeIndicatorSeries` answers "unsupported" for
 * anything outside it, and the alert panel's catalogue offers nothing outside
 * it — so the panel can no longer offer an alert that is armed and then never
 * fires, and an indicator wired into the alert path appears in the panel in the
 * same change rather than in a second list someone has to remember.
 *
 * A leaf on purpose: the catalogue imports this without pulling the indicator
 * maths in with it.
 */
export const ALERT_PATH_INDICATORS: ReadonlySet<string> = new Set([
  "rsi",
  "macd",
  "bollinger",
  "ema",
  "sma",
  "wma",
  "vwma",
  "hma",
  "volume_ma",
  "momentum",
  "williams_r",
  "cci",
  "atr",
  "choppiness",
  "mfi",
  "ao",
  "stochastic",
  "stoch_rsi",
  "adx",
  "super_trend",
  "ichimoku",
  "parabolic_sar",
  "obv",
]);

/**
 * How many candles forward the alert path displaces Ichimoku's two spans.
 *
 * The chart draws span A and span B this many candles after the candle whose
 * windows they come from (`indicatorLayer.ts`, `displacement || 26`), so the
 * cloud a condition reads at a candle is the cloud on screen above it. The
 * core's `ichimoku` has no displacement parameter; a settings card set to
 * another value refuses to arm rather than alert on a cloud that is not drawn
 * (FEAT-0446 group 4).
 *
 * 26, not TradingView's 25: TradingView plots the spans `displacement - 1`
 * candles ahead. The contract is this app's chart.
 */
export const ICHIMOKU_DISPLACEMENT = 26;

/** A price an indicator on the alert path is computed over by default. */
export type AlertPathSource = "close" | "hlc3";

/**
 * The indicators a reference may name a price on (`IndicatorRef.field`), each
 * with the price it is computed over when the reference names none. Mirrors
 * `default_field` in `technicals-wasm/src/rule/indicator.rs`, held to it by
 * `indicatorCatalogue.test.ts` (FEAT-0454).
 *
 * CCI is defined over the typical price, `(high + low + close) / 3`: the WASM
 * core computes it so, and the CCI settings card defaults to `hlc3`. The others
 * default to the close.
 *
 * Three readers: `computeIndicatorSeries` picks the column it computes over,
 * `indicatorKey` files the series under it, and the settings seed compares a
 * card's price against it (BUG-0453) — so "which price does the alert use" has
 * one answer.
 */
const DEFAULT_FIELD_BY_INDICATOR: Readonly<Record<string, AlertPathSource>> = {
  rsi: "close",
  macd: "close",
  stoch_rsi: "close",
  momentum: "close",
  ema: "close",
  bollinger: "close",
  cci: "hlc3",
};

/** The price `indicatorId` is computed over by default, or `null` for none. */
export function defaultFieldOf(indicatorId: string): AlertPathSource | null {
  return Object.hasOwn(DEFAULT_FIELD_BY_INDICATOR, indicatorId)
    ? DEFAULT_FIELD_BY_INDICATOR[indicatorId]
    : null;
}

/** The price a reference is computed over: its own field, else the default. */
export function effectiveFieldOf(indicator: IndicatorRef): PriceField | null {
  return indicator.field ?? defaultFieldOf(indicator.id);
}

/**
 * The price an indicator is computed over when a reference names none: its
 * default, or the close for an indicator that reads several candle values.
 */
export function alertPathSourceOf(indicatorId: string): AlertPathSource {
  return defaultFieldOf(indicatorId) ?? "close";
}
