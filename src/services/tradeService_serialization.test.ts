// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { tradeService } from './tradeService';
import Decimal from 'decimal.js';

describe('TradeService Serialization', () => {
    // Access private method via casting to any
    const service = tradeService as any;

    it('should serialize Decimal objects to strings', () => {
        const payload = {
            price: new Decimal(123.456),
            qty: new Decimal('0.001')
        };
        const result = service.serializePayload(payload);
        expect(result.price).toBe('123.456');
        expect(result.qty).toBe('0.001');
    });

    it('should handle nested objects', () => {
        const payload = {
            order: {
                price: new Decimal(50000),
                meta: {
                    fee: new Decimal('1.5')
                }
            }
        };
        const result = service.serializePayload(payload);
        expect(result.order.price).toBe('50000');
        expect(result.order.meta.fee).toBe('1.5');
    });

    it('should handle arrays', () => {
        const payload = [new Decimal(1), new Decimal(2)];
        const result = service.serializePayload(payload);
        expect(result).toEqual(['1', '2']);
    });

    it('should NOT serialize plain objects with similar methods (Duck Typing Prevention)', () => {
        const fakeDecimal = {
            isZero: () => false,
            toFixed: () => '1.00'
        };
        // It should serialize it as an object (recursively), not convert to string because it fails strict checks
        const result = service.serializePayload(fakeDecimal);
        expect(typeof result).toBe('object');
        // Functions are passed through
        expect(typeof result.isZero).toBe('function');
    });

    it('should serialize Decimal-like objects if constructor name matches (e.g. from another realm)', () => {
        const pseudoDecimal = {
            constructor: { name: 'Decimal' },
            toString: () => '99.99'
        };
        const result = service.serializePayload(pseudoDecimal);
        expect(result).toBe('99.99');
    });
});
