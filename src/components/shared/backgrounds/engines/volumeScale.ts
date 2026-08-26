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
 * Shared volume normalisation for every TradeFlow background engine.
 *
 * ## Why this exists
 *
 * Before this module each engine invented its own volume mapping. They
 * disagreed on the input (BlockEngine used the raw base-asset `amount`,
 * everyone else used notional `price * amount`), on the curve (`pow(x, 0.4)`
 * vs. `log10(x + 1)` vs. `1 + log10(x + 1) * 0.5`) and on the ceiling
 * (`5.0` / `8.0` / `15.0` / `50.0` / no clamp at all). The consequence was
 * that the same trade produced a wildly different visual in each mode, and
 * that a "big block" on BTC and a "big block" on a cheap altcoin meant
 * completely different amounts of money.
 *
 * ## What it does instead
 *
 * 1. **One input unit: notional in quote currency (USD).** `price * amount`.
 *    This is the only figure that is comparable across symbols.
 * 2. **Log compression.** Trade sizes are heavy-tailed over several orders of
 *    magnitude; a linear channel would render everything except the whales as
 *    a flat carpet.
 * 3. **Adaptive window instead of a hardcoded ceiling.** The normaliser keeps
 *    a rolling sample of recent trades and stretches the visible range between
 *    a low and a high percentile of *that* sample. A calm BTC book and a
 *    frantic memecoin book both end up using the full visual range, and the
 *    result is a statement about *this market right now* rather than about an
 *    arbitrary constant someone typed in 2024.
 * 4. **A single normalised output, `0..1`.** Each engine multiplies that by
 *    its own world-space extent, so the modes finally agree with each other.
 *
 * ## decimal.js boundary
 *
 * This module deliberately operates on native `number`. It sits entirely on
 * the render path: its output drives mesh scale in a WebGL worker and never
 * feeds an order, a balance, a position size, or anything the user could
 * transact on. The values arrive as `number` already — `TradeFlowBackground`
 * parses them out of the raw exchange websocket frame for display purposes.
 * Financial math elsewhere in the app stays on `decimal.js`; do not import
 * this module into calculator, risk, or journal code.
 */

/** Tunables for {@link VolumeNormalizer}. */
export interface VolumeNormalizerOptions {
	/** How many recent trades feed the adaptive range. */
	sampleSize?: number;
	/** Lower percentile (0..1) mapped to a normalised 0. */
	lowPercentile?: number;
	/** Upper percentile (0..1) mapped to a normalised 1. */
	highPercentile?: number;
	/**
	 * Minimum spread, in log10 units, between the low and high anchor. Stops
	 * the range from collapsing when every recent trade is the same size,
	 * which would otherwise turn tiny noise into full-scale swings.
	 */
	minLogSpread?: number;
	/** Smoothing factor per update for the anchors (0..1, higher = snappier). */
	adaptRate?: number;
}

const DEFAULTS = {
	sampleSize: 256,
	lowPercentile: 0.05,
	highPercentile: 0.95,
	minLogSpread: 0.75,
	adaptRate: 0.05
} as const;

/** Notional value of a trade in quote currency. Zero for nonsense input. */
export function tradeNotional(price: number, amount: number): number {
	if (!Number.isFinite(price) || !Number.isFinite(amount)) return 0;
	const notional = price * amount;
	return notional > 0 ? notional : 0;
}

/**
 * Maps trade notionals onto a normalised `0..1` scale using a log curve and
 * an adaptive percentile window over recent trades.
 */
export class VolumeNormalizer {
	private readonly sampleSize: number;
	private readonly lowPercentile: number;
	private readonly highPercentile: number;
	private readonly minLogSpread: number;
	private readonly adaptRate: number;

	/** Ring buffer of log10(notional + 1) for recent trades. */
	private samples: Float64Array;
	private sampleCount = 0;
	private writeIdx = 0;

	/** Smoothed anchors in log10 space. */
	private lowAnchor = 0;
	private highAnchor = 0;
	private hasAnchors = false;

	/** Scratch buffer so percentile() does not allocate per trade. */
	private sorted: Float64Array;

	constructor(options: VolumeNormalizerOptions = {}) {
		this.sampleSize = Math.max(8, Math.floor(options.sampleSize ?? DEFAULTS.sampleSize));
		this.lowPercentile = clamp01(options.lowPercentile ?? DEFAULTS.lowPercentile);
		this.highPercentile = clamp01(options.highPercentile ?? DEFAULTS.highPercentile);
		this.minLogSpread = Math.max(0.01, options.minLogSpread ?? DEFAULTS.minLogSpread);
		this.adaptRate = clamp01(options.adaptRate ?? DEFAULTS.adaptRate);
		this.samples = new Float64Array(this.sampleSize);
		this.sorted = new Float64Array(this.sampleSize);
	}

	/**
	 * Feeds a trade and returns its normalised magnitude in `0..1`.
	 *
	 * `0` is "as small as trades currently get", `1` is "as big as trades
	 * currently get". Both ends are soft: an outlier beyond the current window
	 * clamps rather than blowing up the geometry, and the window moves towards
	 * it over the next few trades.
	 */
	public push(price: number, amount: number): number {
		const notional = tradeNotional(price, amount);
		if (notional <= 0) return 0;

		const logValue = Math.log10(notional + 1);

		this.samples[this.writeIdx] = logValue;
		this.writeIdx = (this.writeIdx + 1) % this.sampleSize;
		if (this.sampleCount < this.sampleSize) this.sampleCount++;

		this.updateAnchors();

		return this.normalizeLog(logValue);
	}

	/**
	 * Normalises a notional against the current window *without* feeding it
	 * into the sample. Useful when re-rendering an already-recorded trade.
	 */
	public normalize(price: number, amount: number): number {
		const notional = tradeNotional(price, amount);
		if (notional <= 0) return 0;
		return this.normalizeLog(Math.log10(notional + 1));
	}

	/** Current window in raw notional terms — for legends and axis labels. */
	public getRange(): { low: number; high: number } {
		if (!this.hasAnchors) return { low: 0, high: 0 };
		return {
			low: Math.max(0, Math.pow(10, this.lowAnchor) - 1),
			high: Math.max(0, Math.pow(10, this.highAnchor) - 1)
		};
	}

	/** Drops all history. Call when the symbol changes. */
	public reset(): void {
		this.sampleCount = 0;
		this.writeIdx = 0;
		this.hasAnchors = false;
		this.lowAnchor = 0;
		this.highAnchor = 0;
	}

	private normalizeLog(logValue: number): number {
		if (!this.hasAnchors) return 0.5;
		const spread = this.highAnchor - this.lowAnchor;
		if (spread <= 0) return 0.5;
		return clamp01((logValue - this.lowAnchor) / spread);
	}

	private updateAnchors(): void {
		const count = this.sampleCount;
		for (let i = 0; i < count; i++) this.sorted[i] = this.samples[i];
		const view = this.sorted.subarray(0, count);
		view.sort();

		let low = percentileOfSorted(view, this.lowPercentile);
		let high = percentileOfSorted(view, this.highPercentile);

		// Keep the window from collapsing onto a single value.
		if (high - low < this.minLogSpread) {
			const mid = (high + low) * 0.5;
			low = mid - this.minLogSpread * 0.5;
			high = mid + this.minLogSpread * 0.5;
		}

		if (!this.hasAnchors) {
			this.lowAnchor = low;
			this.highAnchor = high;
			this.hasAnchors = true;
			return;
		}

		this.lowAnchor += (low - this.lowAnchor) * this.adaptRate;
		this.highAnchor += (high - this.highAnchor) * this.adaptRate;
	}
}

function percentileOfSorted(sorted: Float64Array, p: number): number {
	const n = sorted.length;
	if (n === 0) return 0;
	if (n === 1) return sorted[0];
	const pos = p * (n - 1);
	const lowIdx = Math.floor(pos);
	const highIdx = Math.min(n - 1, lowIdx + 1);
	const frac = pos - lowIdx;
	return sorted[lowIdx] + (sorted[highIdx] - sorted[lowIdx]) * frac;
}

export function clamp01(v: number): number {
	if (!Number.isFinite(v)) return 0;
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}

/**
 * Applies the user's `volumeScale` setting to a normalised magnitude and
 * expands it into an engine's own world-space range.
 *
 * Keeping this in one place is what makes the modes comparable: every engine
 * declares `min`/`max` in its own units and the curve between them is shared.
 */
	export function scaleToRange(
		normalized: number,
		min: number,
		max: number,
		userScale = 1.0
	): number {
		const scale = Number.isFinite(userScale) && userScale > 0 ? userScale : 1.0;
		const t = clamp01(normalized * scale);
		return min + (max - min) * t;
	}

/**
 * Maps a market-activity snapshot to a single 0..1 "heat" used by the dynamic
 * atmosphere. Each signal is normalised against a characteristic full-scale and
 * the strongest wins, so a burst of small trades and a single whale both light
 * up the scene.
 *
 * @param rate         trades in the rolling window (trades/sec)
 * @param volume       total notional (price * amount) in the rolling window, quote currency
 * @param volatilityRel relative price volatility (stdev / mean) over the window
 */
export function marketHeat(input: { rate: number; volume: number; volatilityRel: number }): number {
	const rate = clamp01(input.rate / 20);
	const volume = clamp01(input.volume / 5_000_000);
	const volatilityRel = clamp01(input.volatilityRel / 0.02);
	return Math.max(rate, volume, volatilityRel);
}
