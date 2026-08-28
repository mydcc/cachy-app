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
	relativeAtr,
	rsiToMood,
	readIndicatorSignal,
	pickVolatility,
	pickMood
} from './indicatorSignal';

describe('relativeAtr', () => {
	it('expresses ATR as a fraction of price', () => {
		expect(relativeAtr(900, 90_000)).toBeCloseTo(0.01);
	});

	it('makes two very differently priced symbols comparable', () => {
		// 1% true range on BTC and on a sub-dollar alt must read the same.
		expect(relativeAtr(900, 90_000)).toBeCloseTo(relativeAtr(0.004, 0.4)!);
	});

	it('returns null rather than a wrong number when a piece is missing', () => {
		expect(relativeAtr(undefined, 90_000)).toBeNull();
		expect(relativeAtr(900, undefined)).toBeNull();
		expect(relativeAtr(900, 0)).toBeNull();
		expect(relativeAtr(Number.NaN, 90_000)).toBeNull();
		expect(relativeAtr(-5, 90_000)).toBeNull();
	});
});

describe('rsiToMood', () => {
	it('maps the neutral 50 to exactly zero', () => {
		expect(rsiToMood(50)).toBe(0);
	});

	it('maps the extremes to the full range', () => {
		expect(rsiToMood(100)).toBe(1);
		expect(rsiToMood(0)).toBe(-1);
	});

	it('keeps overbought and oversold apart and symmetric', () => {
		expect(rsiToMood(70)).toBeCloseTo(0.4);
		expect(rsiToMood(30)).toBeCloseTo(-0.4);
	});

	it('does not saturate inside the bands, so 70 and 90 stay distinguishable', () => {
		expect(rsiToMood(90)!).toBeGreaterThan(rsiToMood(70)!);
	});

	it('clamps a nonsense reading instead of leaving the scale', () => {
		expect(rsiToMood(140)).toBe(1);
		expect(rsiToMood(-20)).toBe(-1);
	});

	it('returns null when there is no reading', () => {
		expect(rsiToMood(null)).toBeNull();
		expect(rsiToMood(Number.NaN)).toBeNull();
	});
});

describe('readIndicatorSignal', () => {
	const tech = {
		volatility: { atr: 450 },
		oscillators: [
			{ name: 'MACD', value: 12 },
			{ name: 'RSI', value: 64 }
		],
		pivotBasis: { close: 90_000 }
	};

	it('extracts both signals from a technicals snapshot', () => {
		expect(readIndicatorSignal(tech, null)).toEqual({ volatilityRel: 0.005, rsi: 64 });
	});

	it('prefers the candle close the indicators were computed on', () => {
		// A live price far from the basis must not distort the ATR ratio.
		expect(readIndicatorSignal(tech, 200_000).volatilityRel).toBeCloseTo(0.005);
	});

	it('falls back to the live price when the snapshot carries no basis', () => {
		const noBasis = { volatility: { atr: 450 }, oscillators: tech.oscillators };
		expect(readIndicatorSignal(noBasis, 90_000).volatilityRel).toBeCloseTo(0.005);
	});

	it('reports nulls for an absent or half-filled snapshot', () => {
		expect(readIndicatorSignal(null, 90_000)).toEqual({ volatilityRel: null, rsi: null });
		expect(readIndicatorSignal({ oscillators: [] }, 90_000)).toEqual({
			volatilityRel: null,
			rsi: null
		});
	});

	it('ignores an oscillator list that has no RSI in it', () => {
		expect(readIndicatorSignal({ oscillators: [{ name: 'CCI', value: 3 }] }, 1).rsi).toBeNull();
	});
});

describe('pickVolatility', () => {
	it('uses the trade-derived estimate when the user chose trades', () => {
		expect(pickVolatility(0.02, 0.005, 'trades')).toBe(0.005);
	});

	it('uses ATR when the user chose ATR', () => {
		expect(pickVolatility(0.02, 0.005, 'atr')).toBe(0.02);
	});

	it('falls back to the estimate rather than going flat when ATR is not there yet', () => {
		// Indicators arrive after the first trades, and a symbol without kline
		// history may never produce one. The scene must keep breathing.
		expect(pickVolatility(null, 0.005, 'atr')).toBe(0.005);
	});

	it('never yields a non-finite amplitude', () => {
		expect(pickVolatility(null, Number.NaN, 'atr')).toBe(0);
		expect(pickVolatility(null, Number.NaN, 'trades')).toBe(0);
	});
});

describe('pickMood', () => {
	it('uses the trade-ratio sentiment by default', () => {
		expect(pickMood(0.6, 20, 'sentiment')).toBe(0.6);
	});

	it('uses RSI when selected, replacing nothing else', () => {
		expect(pickMood(0.6, 70, 'rsi')).toBeCloseTo(0.4);
	});

	it('falls back to sentiment when RSI is unavailable', () => {
		expect(pickMood(0.6, null, 'rsi')).toBe(0.6);
	});

	it('never yields a non-finite mood', () => {
		expect(pickMood(Number.NaN, null, 'rsi')).toBe(0);
		expect(pickMood(Number.NaN, null, 'sentiment')).toBe(0);
	});
});
