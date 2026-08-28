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
 * Turns computed indicators into the two continuous signals the Trade Flow
 * background already understands: a relative volatility that feeds `marketHeat`
 * and a mood in `-1..+1` that feeds the `uSentiment` uniform.
 *
 * Trades are events; ATR and RSI are states. Keeping the conversion here — pure,
 * outside both the component and the worker — is what lets the two live side by
 * side without either one needing to know the other exists.
 *
 * Like `volumeScale.ts` this is visual math on plain numbers. Financial maths
 * elsewhere stays on `decimal.js`; do not import this module into calculator,
 * risk, or journal code.
 */

/** Which signal drives the scene's amplitude. */
export type VolatilitySource = 'trades' | 'atr';

/** Which signal drives the scene's colour mood. */
export type MoodSource = 'sentiment' | 'rsi';

/** What the background reads out of a `TechnicalsData` snapshot. */
export interface IndicatorSignal {
	/** ATR as a fraction of price (0.01 = a 1% true range). `null` if unavailable. */
	volatilityRel: number | null;
	/** RSI in `0..100`. `null` if unavailable. */
	rsi: number | null;
}

/** The slice of `TechnicalsData` this module needs — structural, so tests need no fixtures. */
export interface TechnicalsSlice {
	volatility?: { atr?: number };
	oscillators?: { name: string; value: number }[];
	pivotBasis?: { close: number };
}

/**
 * ATR divided by price.
 *
 * The raw ATR is in quote currency, so it is meaningless across symbols — an
 * ATR of 400 is a quiet day on BTC and an impossibility on a sub-dollar alt.
 * Dividing by price yields exactly the `volatilityRel` that `marketHeat()`
 * already expects, which is why the real indicator can replace the trade-derived
 * estimate without touching the heat formula.
 */
export function relativeAtr(atr: number | undefined | null, price: number | undefined | null): number | null {
	if (atr == null || price == null) return null;
	if (!Number.isFinite(atr) || !Number.isFinite(price)) return null;
	if (atr < 0 || price <= 0) return null;
	return atr / price;
}

/**
 * RSI to a mood in `-1..+1`, linearly around the neutral 50.
 *
 * Deliberately linear rather than stretched to the 30/70 bands: stretching would
 * saturate every overbought reading to the same full-strength colour and hide
 * the difference between "70, drifting up" and "90, blowing off". Strength is a
 * separate concern, controlled by the tint setting.
 */
export function rsiToMood(rsi: number | null | undefined): number | null {
	if (rsi == null || !Number.isFinite(rsi)) return null;
	const clamped = Math.min(100, Math.max(0, rsi));
	return (clamped - 50) / 50;
}

/** Reads the two signals out of a technicals snapshot. Missing pieces stay `null`. */
export function readIndicatorSignal(
	tech: TechnicalsSlice | null | undefined,
	lastPrice: number | null | undefined
): IndicatorSignal {
	if (!tech) return { volatilityRel: null, rsi: null };

	// `pivotBasis.close` is the candle close the indicators were computed on, so
	// it pairs with the ATR exactly. The live price is only a fallback for
	// snapshots that carry no basis.
	const price = tech.pivotBasis?.close ?? lastPrice;
	const rsiEntry = tech.oscillators?.find((o) => o.name === 'RSI');

	return {
		volatilityRel: relativeAtr(tech.volatility?.atr, price),
		rsi: rsiEntry && Number.isFinite(rsiEntry.value) ? rsiEntry.value : null
	};
}

/**
 * Picks the amplitude signal.
 *
 * Falls back to the trade-derived estimate whenever the indicator is not there
 * yet — indicators arrive a moment after the first trades, and on a symbol with
 * no kline history they may never arrive. The background must keep breathing
 * either way, so an unavailable indicator degrades rather than freezes.
 */
export function pickVolatility(
	indicator: number | null,
	tradeDerived: number,
	source: VolatilitySource
): number {
	if (source === 'atr' && indicator != null) return indicator;
	return Number.isFinite(tradeDerived) ? tradeDerived : 0;
}

/** Picks the mood signal, with the same fall-back-rather-than-freeze rule. */
export function pickMood(sentiment: number, rsi: number | null, source: MoodSource): number {
	if (source === 'rsi') {
		const mood = rsiToMood(rsi);
		if (mood != null) return mood;
	}
	return Number.isFinite(sentiment) ? sentiment : 0;
}
