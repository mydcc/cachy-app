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

import { describe, it, expect } from 'vitest';
import { smoothingAlpha } from './smoothing';

describe('smoothingAlpha', () => {
	it('is zero for a missing or non-positive step', () => {
		expect(smoothingAlpha(0, 1)).toBe(0);
		expect(smoothingAlpha(-0.016, 1)).toBe(0);
		expect(smoothingAlpha(Number.NaN, 1)).toBe(0);
		expect(smoothingAlpha(0.016, 0)).toBe(0);
		expect(smoothingAlpha(0.016, Number.NaN)).toBe(0);
	});

	it('stays within (0, 1) for a positive step', () => {
		const alpha = smoothingAlpha(0.016, 0.8);
		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
	});

	it('applies more of the step as dt grows', () => {
		expect(smoothingAlpha(0.033, 0.8)).toBeGreaterThan(smoothingAlpha(0.016, 0.8));
	});

	it('reaches the same state at 120 Hz as at 60 Hz over the same time', () => {
		// Two 120 Hz steps must land where one 60 Hz step does — the whole point
		// of deriving the factor from dt instead of hard-coding it.
		const oneStep = smoothingAlpha(1 / 60, 0.8);
		const twoSteps = 1 - Math.pow(1 - smoothingAlpha(1 / 120, 0.8), 2);
		expect(twoSteps).toBeCloseTo(oneStep, 10);
	});
});
