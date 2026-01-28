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
import { tradeState } from '../stores/trade.svelte';
import { Decimal } from 'decimal.js';

describe('Financial Precision Hardening', () => {
    it('should store high precision prices as strings', () => {
        const highPrecisionPrice = "0.00000001234567891234";

        tradeState.update(s => ({ ...s, entryPrice: highPrecisionPrice }));

        expect(tradeState.entryPrice).toBe(highPrecisionPrice);
        expect(typeof tradeState.entryPrice).toBe('string');
    });

    it('should handle Decimal conversion correctly', () => {
        const highPrecisionPrice = "0.00000001234567891234";
        tradeState.update(s => ({ ...s, entryPrice: highPrecisionPrice }));

        const decimalPrice = new Decimal(tradeState.entryPrice!);
        // Ensure we compare value, handling notation differences
        expect(decimalPrice.eq(highPrecisionPrice)).toBe(true);
        // Ensure toFixed preserves digits
        expect(decimalPrice.toFixed(20)).toBe(highPrecisionPrice);
    });

    it('should update risk amount as string', () => {
        const risk = "50.123456";
        tradeState.update(s => ({ ...s, riskAmount: risk }));
        expect(tradeState.riskAmount).toBe(risk);
    });
});
