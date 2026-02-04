import { describe, it, expect } from 'vitest';
import { StatefulTechnicalsCalculator } from '../../utils/statefulTechnicalsCalculator';
import { Decimal } from 'decimal.js';

function mockKline(time: number, close: number) {
    return {
        time,
        open: new Decimal(close),
        high: new Decimal(close),
        low: new Decimal(close),
        close: new Decimal(close),
        volume: new Decimal(100)
    };
}

describe('Bollinger Bands Optimization Regression', () => {

    it('should match naive O(N) calculation with O(1) incremental update', () => {
        const history = [];
        const len = 50;
        // Generate random walk
        let price = 100;
        for(let i=0; i<len; i++) {
            price += (Math.random() - 0.5) * 5;
            history.push(mockKline(1000 + i*60, price));
        }

        const settings = { bb: { length: 20, stdDev: 2 } };
        const enabled = { bb: true };

        const calc = new StatefulTechnicalsCalculator();
        calc.initialize(history, settings, enabled);

        // Simulation Loop
        const steps = 100;
        for(let i=0; i<steps; i++) {
            price += (Math.random() - 0.5) * 5;
            const newCandle = mockKline(1000 + (len+i)*60, price);

            // 1. Calculate Incremental (New Logic)
            const incResult = calc.update(newCandle);
            const incBB = incResult.volatility?.bb;

            // 2. Calculate Naive (Truth)
            // Need last 19 from history + current price
            // Note: 'history' array here tracks CLOSED candles.
            // We append 'newCandle' AFTER calculation.
            const fullHistory = history.map(k => k.close.toNumber());
            const last19 = fullHistory.slice(-(20-1));
            const window = [...last19, price];

            if (window.length === 20) {
                const sum = window.reduce((a, b) => a + b, 0);
                const mean = sum / 20;
                // Population Variance (N)
                const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
                const std = Math.sqrt(variance);

                const expectedUpper = mean + 2 * std;
                const expectedLower = mean - 2 * std;
                const expectedMiddle = mean;

                if (!incBB) throw new Error("BB result undefined");

                // Check with high precision (10 digits)
                // Incremental calc might have slight float drift, but usually very small.
                // We use 10 digits as 'close enough' for financial floats.
                expect(incBB.middle).toBeCloseTo(expectedMiddle, 10);
                expect(incBB.upper).toBeCloseTo(expectedUpper, 10);
                expect(incBB.lower).toBeCloseTo(expectedLower, 10);
            }

            // Shift for next step
            calc.shift(newCandle);
            history.push(newCandle);
        }
    });
});
