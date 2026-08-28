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
 * The market-to-visual contract of the Trade Flow galaxy mode. Everything else
 * in `GalaxyFlowEngine` is GPU work; these two functions are the whole reason
 * the mode is a trading feature rather than a screensaver, so they are the part
 * worth pinning down.
 */

import { describe, it, expect } from 'vitest';
import {
	tradePulseStrength,
	activityRotationSpeed,
	pulseGeometry,
	pulseTravelSpan,
	priceAxisWorldRadius,
	priceAxisPosition
} from './GalaxyFlowEngine';

describe('tradePulseStrength', () => {
	it('gives the smallest trade a visible ripple rather than nothing', () => {
		expect(tradePulseStrength(0, 1, 1)).toBeGreaterThan(0);
	});

	it('grows monotonically with normalised trade size', () => {
		const small = tradePulseStrength(0.1, 1, 1);
		const mid = tradePulseStrength(0.5, 1, 1);
		const large = tradePulseStrength(0.9, 1, 1);
		expect(small).toBeLessThan(mid);
		expect(mid).toBeLessThan(large);
	});

	it('never exceeds 1, so an outlier cannot blow the disc apart', () => {
		expect(tradePulseStrength(1, 5, 3)).toBeLessThanOrEqual(1);
		expect(tradePulseStrength(1, 1, 1)).toBeLessThanOrEqual(1);
	});

	it('silences the galaxy at zero reactivity', () => {
		expect(tradePulseStrength(1, 1, 0)).toBe(0);
		expect(tradePulseStrength(0.5, 2, 0)).toBe(0);
	});

	it('treats a negative or non-finite reactivity as off, not as an inversion', () => {
		expect(tradePulseStrength(0.8, 1, -2)).toBe(0);
		expect(tradePulseStrength(0.8, 1, Number.NaN)).toBe(0);
	});

	it('amplifies with the user volume scale', () => {
		expect(tradePulseStrength(0.3, 2, 1)).toBeGreaterThan(tradePulseStrength(0.3, 1, 1));
	});
});

describe('activityRotationSpeed', () => {
	it('returns the base speed in a dead market', () => {
		expect(activityRotationSpeed(0.1, 0, 1)).toBeCloseTo(0.1);
	});

	it('speeds the galaxy up as market heat rises', () => {
		const calm = activityRotationSpeed(0.1, 0.2, 1);
		const busy = activityRotationSpeed(0.1, 0.9, 1);
		expect(busy).toBeGreaterThan(calm);
	});

	it('caps the boost at full heat, so an activity spike cannot run away', () => {
		expect(activityRotationSpeed(0.1, 1, 1)).toBeCloseTo(0.2);
		expect(activityRotationSpeed(0.1, 99, 1)).toBeCloseTo(0.2);
	});

	it('leaves rotation constant when the coupling is off', () => {
		expect(activityRotationSpeed(0.1, 1, 0)).toBeCloseTo(0.1);
	});

	it('keeps a stopped galaxy stopped no matter how hot the market gets', () => {
		expect(activityRotationSpeed(0, 1, 5)).toBe(0);
	});
});

describe('pulseGeometry — the radial price axis', () => {
	it('reproduces the plain burst when the price axis is off', () => {
		// Every wave from the core, sweeping outward, regardless of side or price.
		expect(pulseGeometry(0.9, true, false)).toEqual({ startRadius: 0, direction: 1 });
		expect(pulseGeometry(0.1, false, false)).toEqual({ startRadius: 0, direction: 1 });
	});

	it('places a higher price further out on the disc', () => {
		const low = pulseGeometry(0.1, true, true).startRadius;
		const mid = pulseGeometry(0.5, true, true).startRadius;
		const high = pulseGeometry(0.9, true, true).startRadius;
		expect(low).toBeLessThan(mid);
		expect(mid).toBeLessThan(high);
	});

	it('sweeps buys outward and sells inward', () => {
		expect(pulseGeometry(0.5, true, true).direction).toBe(1);
		expect(pulseGeometry(0.5, false, true).direction).toBe(-1);
	});

	it('places the same price identically whichever side traded', () => {
		// Only the direction encodes the side; the radius is purely the price.
		expect(pulseGeometry(0.7, true, true).startRadius).toBe(
			pulseGeometry(0.7, false, true).startRadius
		);
	});

	it('keeps every wave on the disc, including at both range extremes', () => {
		// The failure this guards against: in a sustained rally every trade is
		// the top of its own range, so a rim-born wave would leave immediately
		// and the effect would go quiet exactly when the market is loudest.
		for (const p of [0, 0.5, 1]) {
			for (const buy of [true, false]) {
				const { startRadius } = pulseGeometry(p, buy, true);
				expect(startRadius).toBeGreaterThan(0.05);
				expect(startRadius).toBeLessThan(0.95);
			}
		}
	});

	it('leaves a visible sweep at the top of the range', () => {
		// A buy at the very top must still cross a real span of disc before it
		// reaches the rim, not a sliver.
		const { startRadius } = pulseGeometry(1, true, true);
		expect(1 - startRadius).toBeGreaterThan(0.15);
	});

	it('clamps a price position that arrives out of range', () => {
		expect(pulseGeometry(-3, true, true).startRadius).toBe(
			pulseGeometry(0, true, true).startRadius
		);
		expect(pulseGeometry(42, true, true).startRadius).toBe(
			pulseGeometry(1, true, true).startRadius
		);
	});
});

describe('priceAxisPosition — the axis the rings and waves share', () => {
	const window = { low: 89_900, high: 90_100 }; // seconds of prints: 200 wide
	const last = 90_000;
	const atr = 400; // 14 candles: far wider than the trade window

	it('keeps the ±1 ATR rings well inside the disc, not pinned to its ends', () => {
		// The defect this exists to prevent: with a trade-window-only axis both
		// ATR rings clamped to 0 and 1 and marked nothing.
		const lowBand = priceAxisPosition(last - atr, window, last, atr);
		const highBand = priceAxisPosition(last + atr, window, last, atr);
		expect(lowBand).toBeGreaterThan(0.05);
		expect(highBand).toBeLessThan(0.95);
		expect(highBand - lowBand).toBeGreaterThan(0.3);
	});

	it('puts the middle of the recent range at the centre of the axis', () => {
		const mid = (window.low + window.high) / 2;
		expect(priceAxisPosition(mid, window, last, atr)).toBeCloseTo(0.5, 2);
	});

	it('does NOT re-centre itself on every incoming trade', () => {
		// The defect this pins down: anchoring the ATR envelope to the last trade
		// made each new trade land mid-axis by construction, because the envelope
		// moved with it. Two trades at very different prices — each of them the
		// latest at the time — must land in very different places.
		const high = priceAxisPosition(90_400, window, 90_400, atr);
		const low = priceAxisPosition(89_600, window, 89_600, atr);
		expect(high).toBeGreaterThan(low + 0.3);
	});

	it('keeps the axis still while the price walks across it', () => {
		// Same window, same ATR, only the traded price differs: positions must
		// spread out rather than collapse onto 0.5.
		const walk = [89_600, 89_800, 90_000, 90_200, 90_400].map((p) =>
			priceAxisPosition(p, window, p, atr)
		);
		for (let i = 1; i < walk.length; i++) expect(walk[i]).toBeGreaterThan(walk[i - 1]);
		expect(walk[walk.length - 1] - walk[0]).toBeGreaterThanOrEqual(0.4);
	});

	it('separates the mid ring from the upper band', () => {
		// Previously these coincided whenever the last price topped the window.
		const mid = priceAxisPosition(last, window, last, atr);
		const high = priceAxisPosition(last + atr, window, last, atr);
		expect(high - mid).toBeGreaterThan(0.15);
	});

	it('still lets a trade burst wider than the ATR fit on screen', () => {
		// Union, not replacement: a violent minute must not run off the axis.
		const wide = { low: 80_000, high: 100_000 };
		expect(priceAxisPosition(80_000, wide, last, atr)).toBe(0);
		expect(priceAxisPosition(100_000, wide, last, atr)).toBe(1);
		expect(priceAxisPosition(90_000, wide, last, atr)).toBeGreaterThan(0);
	});

	it('falls back to the trade window alone when no ATR is available', () => {
		expect(priceAxisPosition(90_000, window, last, null)).toBeCloseTo(0.5);
		expect(priceAxisPosition(89_900, window, last, null)).toBe(0);
	});

	it('works from the ATR envelope alone before the window has anchors', () => {
		const empty = { low: 0, high: 0 };
		expect(priceAxisPosition(last, empty, last, atr)).toBeCloseTo(0.5);
		expect(priceAxisPosition(last + atr, empty, last, atr)).toBeGreaterThan(0.5);
	});

	it('answers mid-axis when there is nothing to measure against', () => {
		expect(priceAxisPosition(90_000, { low: 0, high: 0 }, null, null)).toBe(0.5);
		expect(priceAxisPosition(90_000, { low: 5, high: 5 }, null, null)).toBe(0.5);
	});

	it('stays monotonic in price', () => {
		const at = (p: number) => priceAxisPosition(p, window, last, atr);
		expect(at(89_500)).toBeLessThan(at(90_000));
		expect(at(90_000)).toBeLessThan(at(90_500));
	});
});

describe('priceAxisWorldRadius — where a reference ring must sit', () => {
	/** The vertex shader's own placement: pow(radiusRatio, power) * radius. */
	const shaderRadius = (ratio: number, power: number, galaxyRadius: number) =>
		Math.pow(ratio, power) * galaxyRadius;

	it('lands a ring on exactly the circle the shader draws that price at', () => {
		// This is the whole point of the function: a ring one concentration curve
		// away from its own particles marks the wrong price.
		for (const p of [0, 0.25, 0.5, 0.75, 1]) {
			const { startRadius } = pulseGeometry(p, true, true);
			expect(priceAxisWorldRadius(p, 1.5, 60)).toBeCloseTo(shaderRadius(startRadius, 1.5, 60), 10);
		}
	});

	it('follows the concentration curve rather than a straight line', () => {
		// With power 1.5 the mid of the price range is NOT the mid of the disc.
		const mid = priceAxisWorldRadius(0.5, 1.5, 60);
		const low = priceAxisWorldRadius(0, 1.5, 60);
		const high = priceAxisWorldRadius(1, 1.5, 60);
		expect(mid).toBeLessThan((low + high) / 2);
	});

	it('grows monotonically with price', () => {
		const radii = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => priceAxisWorldRadius(p, 1.5, 60));
		for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
	});

	it('scales with the galaxy radius', () => {
		expect(priceAxisWorldRadius(0.5, 1.5, 120)).toBeCloseTo(priceAxisWorldRadius(0.5, 1.5, 60) * 2);
	});

	it('clamps a price outside the window to the ends of the usable band', () => {
		// A ±1 ATR band wider than everything traded recently pins to the edges.
		expect(priceAxisWorldRadius(-4, 1.5, 60)).toBeCloseTo(priceAxisWorldRadius(0, 1.5, 60));
		expect(priceAxisWorldRadius(9, 1.5, 60)).toBeCloseTo(priceAxisWorldRadius(1, 1.5, 60));
	});

	it('never returns a negative or non-finite radius', () => {
		expect(priceAxisWorldRadius(0.5, Number.NaN, 60)).toBeGreaterThan(0);
		expect(priceAxisWorldRadius(0.5, 1.5, Number.NaN)).toBe(0);
		expect(priceAxisWorldRadius(0.5, -2, 60)).toBeGreaterThan(0);
	});
});

describe('pulseTravelSpan', () => {
	it('sweeps the whole disc only when radius carries no meaning', () => {
		expect(pulseTravelSpan(false)).toBeGreaterThan(1);
	});

	it('keeps a price-axis wave near the price that produced it', () => {
		const priceSpan = pulseTravelSpan(true);
		expect(priceSpan).toBeGreaterThan(0);
		expect(priceSpan).toBeLessThan(0.5);
	});
});
