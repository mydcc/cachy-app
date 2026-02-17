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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Fast Conversion Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { toNumFast } from '../../src/utils/fastConversion';
import { Decimal } from 'decimal.js';

describe('toNumFast', () => {
    describe('Numbers', () => {
        it('should return number as is', () => {
            expect(toNumFast(123)).toBe(123);
            expect(toNumFast(0)).toBe(0);
            expect(toNumFast(-5)).toBe(-5);
            expect(toNumFast(1.5)).toBe(1.5);
            expect(toNumFast(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
            expect(toNumFast(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
        });
    });

    describe('Strings', () => {
        it('should parse valid numeric strings', () => {
            expect(toNumFast('123')).toBe(123);
            expect(toNumFast('123.45')).toBe(123.45);
            expect(toNumFast('-5')).toBe(-5);
            expect(toNumFast('0')).toBe(0);
        });

        it('should handle invalid strings', () => {
            expect(toNumFast('abc')).toBe(0); // parseFloat('abc') is NaN -> returns 0
            expect(toNumFast('')).toBe(0); // parseFloat('') is NaN -> returns 0
            expect(toNumFast('  ')).toBe(0);
            expect(toNumFast('12abc')).toBe(12); // parseFloat behavior
        });
    });

    describe('Decimal Instances', () => {
        it('should handle Decimal instances', () => {
            expect(toNumFast(new Decimal(123))).toBe(123);
            expect(toNumFast(new Decimal('123.45'))).toBe(123.45);
            expect(toNumFast(new Decimal(0))).toBe(0);
            expect(toNumFast(new Decimal(-5))).toBe(-5);
        });
    });

    describe('Decimal-like Objects', () => {
        it('should use .toNumber() if available', () => {
            const mockDecimal = { toNumber: () => 42 };
            // @ts-ignore
            expect(toNumFast(mockDecimal)).toBe(42);
        });
    });

    describe('Serialized Decimal Objects', () => {
        it('should handle serialized Decimal objects', () => {
            // Testing the path: if ((val as any).s !== undefined && (val as any).e !== undefined) { return new Decimal(val).toNumber(); }
            // This happens when val is NOT instanceof Decimal and does NOT have toNumber method.

            // Create a plain object that looks like a Decimal but isn't an instance.
            // Using a real Decimal to copy properties so it's a valid structure for Decimal constructor if supported.
            const realDecimal = new Decimal(123);
            const plainObject = {
                s: realDecimal.s,
                e: realDecimal.e,
                d: realDecimal.d,
                // No toNumber method
            };

            // If new Decimal(plainObject) works, this passes.
            // If it throws, we catch it here.
            try {
                const result = toNumFast(plainObject);
                expect(result).toBe(123);
            } catch (e) {
                // If it fails, maybe the code path is indeed problematic for plain objects.
                // But let's assume for now it might work or we want to verify.
                throw e;
            }
        });
    });

    describe('Edge Cases', () => {
        it('should return 0 for null', () => {
            expect(toNumFast(null)).toBe(0);
        });

        it('should return 0 for undefined', () => {
            expect(toNumFast(undefined)).toBe(0);
        });

        it('should return 0 for empty object', () => {
            expect(toNumFast({})).toBe(0);
        });

        it('should return 0 for boolean', () => {
            // @ts-ignore
            expect(toNumFast(true)).toBe(0);
            // @ts-ignore
            expect(toNumFast(false)).toBe(0);
        });
    });
});
