import { describe, it, expect } from 'vitest';
import { technicalsService } from './technicalsService';
import { Decimal } from 'decimal.js';

function generateKlines(count: number) {
    const klines = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        if (i < 20) price += 1;
        else if (i < 30) price -= 2;
        else price += 2;

        klines.push({
            open: new Decimal(price - 1),
            high: new Decimal(price + 2),
            low: new Decimal(price - 2),
            close: new Decimal(price),
            volume: new Decimal(1000)
        });
    }
    return klines;
}

describe('technicalsService', () => {
    it('should calculate new oscillators correctly', () => {
        const klines = generateKlines(250);
        const result = technicalsService.calculateTechnicals(klines);

        expect(result).toBeDefined();
        expect(result.oscillators).toBeDefined();

        const cci = result.oscillators.find(o => o.name.includes('CCI'));
        expect(cci).toBeDefined();
        expect(Decimal.isDecimal(cci?.value)).toBe(true);

        const adx = result.oscillators.find(o => o.name.includes('ADX'));
        expect(adx).toBeDefined();
        expect(Decimal.isDecimal(adx?.value)).toBe(true);

        const ao = result.oscillators.find(o => o.name.includes('Awesome Osc'));
        expect(ao).toBeDefined();
        expect(Decimal.isDecimal(ao?.value)).toBe(true);

        const mom = result.oscillators.find(o => o.name.includes('Momentum'));
        expect(mom).toBeDefined();
        expect(Decimal.isDecimal(mom?.value)).toBe(true);
    });

    it('should respect custom settings', () => {
        const klines = generateKlines(250);
        // Note: 'length' in ADX is mapped to 'adxSmoothing' in our migration logic in store,
        // but here we pass raw object. TechnicalsService expects 'adxSmoothing' now.
        // We simulate the migrated object here.
        const settings: any = {
            cci: { length: 10, threshold: 50 },
            adx: { adxSmoothing: 10, diLength: 10, threshold: 20 },
            ao: { fastLength: 2, slowLength: 5 },
            momentum: { length: 5, source: 'close' }
        };

        const result = technicalsService.calculateTechnicals(klines, settings);
        const names = result.oscillators.map(o => o.name);

        expect(names.some(n => n.includes('CCI (10)'))).toBe(true);
        // The service now outputs `ADX (Smooth, DI Len)` -> `ADX (10, 10)`
        expect(names.some(n => n.includes('ADX (10, 10)'))).toBe(true);
        expect(names.some(n => n.includes('Momentum (5)'))).toBe(true);
    });
});
