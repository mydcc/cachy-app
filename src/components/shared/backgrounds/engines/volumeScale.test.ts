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

import { describe, it, expect } from 'vitest';
import {
	VolumeNormalizer,
	PriceRangeTracker,
	scaleToRange,
	tradeNotional,
	marketHeat
} from './volumeScale';

describe('tradeNotional', () => {
	it('multiplies price and amount', () => {
		expect(tradeNotional(50_000, 0.2)).toBeCloseTo(10_000);
	});

	it('returns 0 for non-finite or negative input instead of NaN', () => {
		expect(tradeNotional(NaN, 1)).toBe(0);
		expect(tradeNotional(100, Infinity)).toBe(0);
		expect(tradeNotional(-5, 2)).toBe(0);
	});
});

describe('VolumeNormalizer', () => {
	it('maps a steady stream of equal trades to mid-range', () => {
		const n = new VolumeNormalizer({ adaptRate: 1 });
		let last = 0;
		for (let i = 0; i < 60; i++) last = n.push(100, 1);
		expect(last).toBeGreaterThan(0.25);
		expect(last).toBeLessThan(0.75);
	});

	it('keeps outputs inside 0..1 for any input', () => {
		const n = new VolumeNormalizer();
		for (let i = 0; i < 200; i++) {
			const v = n.push(10 ** (i % 7), (i % 5) + 0.1);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});

	it('ranks a whale trade above small trades (monotonicity)', () => {
		const n = new VolumeNormalizer({ sampleSize: 64 });
		for (let i = 0; i < 80; i++) n.push(100, 0.01);
		const small = n.push(100, 0.01);
		const whale = n.push(100, 500);
		expect(whale).toBeGreaterThan(small);
		expect(whale).toBeGreaterThan(0.9);
	});

	it('adapts to a new symbol regime without manual rescaling', () => {
		// BTC-like notionals first...
		const n = new VolumeNormalizer({ adaptRate: 1 });
		for (let i = 0; i < 100; i++) n.push(60_000, (i % 4) * 0.05 + 0.01);

		n.reset();

		// ...then a cheap coin whose typical trade is a few dollars.
		for (let i = 0; i < 100; i++) n.push(0.008, (i % 9) * 400 + 100);
		const bigForThisCoin = n.normalize(0.008, 90_000);
		const smallForThisCoin = n.normalize(0.008, 120);
		expect(bigForThisCoin).toBeGreaterThan(smallForThisCoin);
		expect(bigForThisCoin).toBeGreaterThan(0.85);
	});

	it('normalize() does not pollute the window it measures against', () => {
		const n = new VolumeNormalizer({ adaptRate: 1 });
		for (let i = 0; i < 50; i++) n.push(100, 1);
		const before = n.getRange().high;
		for (let i = 0; i < 20; i++) n.normalize(100, 1e12);
		expect(n.getRange().high).toBeCloseTo(before, 5);
	});

	it('reset() clears anchors so the next push re-warms cleanly', () => {
		const n = new VolumeNormalizer({ adaptRate: 1 });
		for (let i = 0; i < 30; i++) n.push(100, 1);
		n.reset();
		const v = n.push(0.001, 500);
		expect(v).toBeGreaterThan(0.25);
		expect(v).toBeLessThan(0.75);
	});
});

describe('scaleToRange', () => {
	it('expands normalized values into the engine range', () => {
		expect(scaleToRange(0, 1, 5)).toBeCloseTo(1);
		expect(scaleToRange(1, 1, 5)).toBeCloseTo(5);
		expect(scaleToRange(0.5, 1, 5)).toBeCloseTo(3);
	});

	it('clamps out-of-band input and ignores invalid user scale', () => {
		expect(scaleToRange(1.7, 1, 5)).toBeCloseTo(5);
		expect(scaleToRange(-0.2, 1, 5)).toBeCloseTo(1);
		// userScale of NaN/0 must not collapse everything to min
		expect(scaleToRange(0.5, 1, 5, Number.NaN)).toBeCloseTo(3);
		expect(scaleToRange(0.5, 1, 5, 0)).toBeCloseTo(3);
	});
});

describe('marketHeat', () => {
	it('is 0 when the market is completely quiet', () => {
		expect(marketHeat({ rate: 0, volume: 0, volatilityRel: 0 })).toBe(0);
	});

	it('captures a hot market from a high trade rate', () => {
		expect(marketHeat({ rate: 40, volume: 1e5, volatilityRel: 0.001 })).toBeGreaterThan(0.9);
	});

	it('captures a hot market from large notional volume', () => {
		expect(marketHeat({ rate: 1, volume: 1e7, volatilityRel: 0.001 })).toBeGreaterThan(0.9);
	});

	it('captures a hot market from high relative volatility', () => {
		expect(marketHeat({ rate: 1, volume: 1e3, volatilityRel: 0.05 })).toBeGreaterThan(0.9);
	});

	it('stays within 0..1 even when every signal is extreme', () => {
		const v = marketHeat({ rate: 1e6, volume: 1e12, volatilityRel: 1 });
		expect(v).toBeGreaterThanOrEqual(0);
		expect(v).toBeLessThanOrEqual(1);
	});

	it('is low for a sparse, calm market', () => {
		// ~1 trade/sec, modest volume, very stable price
		expect(marketHeat({ rate: 1, volume: 2_000, volatilityRel: 0.001 })).toBeLessThan(0.2);
	});
});

describe('PriceRangeTracker', () => {
	it('puts the very first price mid-range, not at an edge', () => {
		// With nothing to compare against, "at the bottom of the range" would be
		// a claim the tracker cannot support.
		expect(new PriceRangeTracker().push(90_000)).toBeCloseTo(0.5, 5);
	});

	it('positions prices monotonically within the window', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		expect(t.normalize(90_050)).toBeLessThan(t.normalize(90_250));
		expect(t.normalize(90_250)).toBeLessThan(t.normalize(90_450));
	});

	it('maps the extremes of a settled range near 0 and 1', () => {
		const t = new PriceRangeTracker({ adaptRate: 1 });
		for (let i = 0; i < 200; i++) t.push(90_000 + (i % 101) * 10); // 90000..91000
		expect(t.normalize(90_000)).toBeLessThan(0.1);
		expect(t.normalize(91_000)).toBeGreaterThan(0.9);
	});

	it('does not turn a flat market into full-scale swings', () => {
		// Every print identical: without a minimum spread the window collapses
		// and one tick of noise would sweep the whole axis.
		const t = new PriceRangeTracker();
		for (let i = 0; i < 50; i++) t.push(90_000);
		const range = t.getRange();
		expect(range.high).toBeGreaterThan(range.low);
		expect(t.normalize(90_000)).toBeCloseTo(0.5, 2);
	});

	it('clamps an outlier instead of letting it run off the scale', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		expect(t.normalize(10_000_000)).toBe(1);
		expect(t.normalize(1)).toBe(0);
	});

	it('survives a single bad print, unlike a raw min/max window', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		t.push(9_000_000); // one nonsense print
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		// A raw max would have pinned the top at 9M and squashed every real
		// trade to ~0. The percentile anchor discards it.
		const mid = t.normalize(90_250);
		expect(mid).toBeGreaterThan(0.15);
		expect(mid).toBeLessThan(0.85);
	});

	it('re-learns from scratch after a symbol change', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		t.reset();
		// A price from a completely different market must not clamp to an edge.
		expect(t.push(2_400)).toBeCloseTo(0.5, 5);
		expect(t.getRange().low).toBeGreaterThan(0);
	});

	it('ignores non-finite and non-positive prices', () => {
		const t = new PriceRangeTracker();
		expect(t.push(Number.NaN)).toBe(0.5);
		expect(t.push(0)).toBe(0.5);
		expect(t.push(-5)).toBe(0.5);
		expect(t.getRange()).toEqual({ low: 0, high: 0 });
	});

	it('follows a trending market instead of leaving the window behind', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		const before = t.getRange();
		for (let p = 90_500; p <= 92_000; p += 10) t.push(p);
		const after = t.getRange();
		expect(after.high).toBeGreaterThan(before.high);
		expect(after.low).toBeGreaterThan(before.low);
	});

	it('saturates at the top while the trend runs, then releases once it stalls', () => {
		// In a monotonic rally every new print IS the high of its own window, so
		// pinning at 1 is the honest answer — but it must not be permanent.
		const t = new PriceRangeTracker();
		let last = 0;
		for (let p = 90_000; p <= 92_000; p += 10) last = t.push(p);
		expect(last).toBeCloseTo(1, 2);

		// Trend stalls and the market oscillates around the new level.
		for (let i = 0; i < 300; i++) t.push(92_000 + (i % 2 ? 40 : -40));
		expect(t.normalize(92_000)).toBeLessThan(0.95);
		expect(t.normalize(92_000)).toBeGreaterThan(0.05);
	});

	it('feeds the window without moving it via normalize()', () => {
		const t = new PriceRangeTracker();
		for (let p = 90_000; p <= 90_500; p += 10) t.push(p);
		const before = t.getRange();
		t.normalize(95_000);
		expect(t.getRange()).toEqual(before);
	});
});
