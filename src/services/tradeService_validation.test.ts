import { describe, it, expect } from 'vitest';
import { TpSlOrderSchema } from '../types/apiSchemas';

describe('TpSlOrder Validation', () => {
    it('should validate a valid TP/SL order', () => {
        const validOrder = {
            orderId: "12345",
            symbol: "BTCUSDT",
            planType: "PROFIT",
            triggerPrice: "50000.50",
            qty: "0.1",
            status: "pending",
            createTime: 1678900000000
        };

        const result = TpSlOrderSchema.safeParse(validOrder);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.orderId).toBe("12345");
            expect(result.data.planType).toBe("PROFIT");
        }
    });

    it('should validate numeric orderId and convert to string', () => {
        const numericOrder = {
            orderId: 12345,
            symbol: "BTCUSDT",
            planType: "LOSS",
            triggerPrice: 49000,
            status: "pending"
        };

        const result = TpSlOrderSchema.safeParse(numericOrder);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.orderId).toBe("12345");
            expect(result.data.triggerPrice).toBe("49000");
        }
    });

    it('should fail on missing required fields', () => {
        const invalidOrder = {
            orderId: "12345",
            // symbol missing
            planType: "PROFIT",
            triggerPrice: "50000"
            // status missing
        };

        const result = TpSlOrderSchema.safeParse(invalidOrder);
        expect(result.success).toBe(false);
    });

    it('should fail on invalid enum values', () => {
        const invalidOrder = {
            orderId: "12345",
            symbol: "BTCUSDT",
            planType: "INVALID_TYPE",
            triggerPrice: "50000",
            status: "pending"
        };

        const result = TpSlOrderSchema.safeParse(invalidOrder);
        expect(result.success).toBe(false);
    });
});
