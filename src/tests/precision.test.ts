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
