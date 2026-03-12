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
import { getChannelsForRequirement, REQUIREMENT_TO_CHANNELS } from './dataRequirements';

describe('dataRequirements - getChannelsForRequirement', () => {

    describe('Standard Data Requirements', () => {
        it('should return correct channel array for "ticker" requirement', () => {
            const result = getChannelsForRequirement('ticker');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(REQUIREMENT_TO_CHANNELS['ticker']);
            // Validate the actual content based on the dictionary
            expect(result).toEqual(['ticker']);
        });

        it('should return correct channel array for "price" requirement', () => {
            const result = getChannelsForRequirement('price');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(REQUIREMENT_TO_CHANNELS['price']);
            // Validate the actual content based on the dictionary
            expect(result).toEqual(['price']);
        });

        it('should return correct channel array for "depth" requirement', () => {
            const result = getChannelsForRequirement('depth');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(REQUIREMENT_TO_CHANNELS['depth']);
            // Validate the actual content based on the dictionary
            expect(result).toEqual(['depth_book5']);
        });

        it('should return correct channel array for "positions" requirement', () => {
            const result = getChannelsForRequirement('positions');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(REQUIREMENT_TO_CHANNELS['positions']);
            // Validate the actual content based on the dictionary
            expect(result).toEqual(['positions']);
        });

        it('should return correct channel array for "orders" requirement', () => {
            const result = getChannelsForRequirement('orders');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(REQUIREMENT_TO_CHANNELS['orders']);
            // Validate the actual content based on the dictionary
            expect(result).toEqual(['orders']);
        });
    });

    describe('Dynamic/Kline Requirements', () => {
        it('should pass-through standard timeframe klines (e.g. kline_1m)', () => {
            const result = getChannelsForRequirement('kline_1m');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(['kline_1m']);
        });

        it('should pass-through arbitrary kline definitions (e.g. kline_1h)', () => {
            const result = getChannelsForRequirement('kline_1h');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(['kline_1h']);
        });

        it('should pass-through edge case kline requirements (e.g. kline_custom)', () => {
            const result = getChannelsForRequirement('kline_custom');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual(['kline_custom']);
        });
    });

    describe('Fallback and Edge Cases', () => {
        it('should return an empty array for unknown requirements that do not start with "kline_"', () => {
            const result = getChannelsForRequirement('unknown_requirement');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(0);
            expect(result).toEqual([]);
        });

        it('should return an empty array for an empty string', () => {
            const result = getChannelsForRequirement('');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
        });

        it('should handle undefined fallback cleanly if passed undefined at runtime via JS', () => {
            // TypeScript protects against this, but if invoked from pure JS:
            const result = getChannelsForRequirement(undefined as unknown as string);
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
        });

        it('should handle null fallback cleanly if passed null at runtime via JS', () => {
            // TypeScript protects against this, but if invoked from pure JS:
            const result = getChannelsForRequirement(null as unknown as string);
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
        });

        it('should handle object inputs cleanly without crashing (JS boundary case)', () => {
            // Simulate JS sending an object
            const result = getChannelsForRequirement({} as unknown as string);
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
        });
    });

});
