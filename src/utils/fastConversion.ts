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

import { Decimal } from "decimal.js";

/**
 * Fast conversion helper to convert various types to number.
 * Optimized for performance in hot loops.
 *
 * Order of checks:
 * 1. number (fastest)
 * 2. string (common API response) -> parseFloat
 * 3. Decimal/DecimalLike (via .toNumber() check) -> prevents new Decimal() allocation
 * 4. Serialized Decimal (state only) -> new Decimal() fallback
 */
export const toNumFast = (val: any): number => {
    if (typeof val === 'number') return val;

    if (typeof val === 'string') {
       const p = parseFloat(val);
       return isNaN(p) ? 0 : p;
    }

    if (val && typeof val === 'object') {
        // Optimization: Decimal.js toString()+parseFloat is significantly faster than .toNumber()
        if (val instanceof Decimal) {
             return parseFloat(val.toString());
        }

        // Fast path for Decimal or objects with .toNumber()
        // Checks property existence which is faster than instanceof in some cases
        // and handles non-instanceof Decimal-likes
        if (typeof val.toNumber === 'function') return val.toNumber();

        // Fallback for serialized Decimal (state only, no methods)
        // e.g. from JSON.parse()
        if ((val as any).s !== undefined && (val as any).e !== undefined) {
             const d = new Decimal(0);
             Object.assign(d, val);
             return d.toNumber();
        }
    }

    return 0;
};
