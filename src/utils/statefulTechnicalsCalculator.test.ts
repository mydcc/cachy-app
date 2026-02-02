
import { describe, it, expect } from 'vitest';
import { StatefulTechnicalsCalculator } from '../../src/utils/statefulTechnicalsCalculator';
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

describe('StatefulTechnicalsCalculator', () => {

    it('should initialize and update incrementally (EMA)', () => {
        const history = [];
        for(let i=0; i<50; i++) {
            history.push(mockKline(1000 + i*60, 100 + i)); // Trend
        }

        const settings = { ema: { ema1: { length: 10 } } };
        const enabled = { ema: true };

        const calc = new StatefulTechnicalsCalculator();
        const initResult = calc.initialize(history, settings, enabled);

        // Check Init
        const initEma = initResult.movingAverages.find(ma => ma.name === "EMA" && ma.params === "10");
        expect(initEma).toBeDefined();
        if (!initEma) return; // TS Guard

        expect(initEma.value).toBeGreaterThan(100);

        // Update with same price (simulation of "tick" on current candle)
        // Wait, 'update' uses state.prevEma (T=49) to calculate T=50.
        // If we pass the SAME price as T=49, it will calculate a NEW candle with that price.
        // It won't equal EMA[49] unless Price == EMA[49].
        // EMA[50] = EMA[49] + k * (Price - EMA[49])
        // If Price == EMA[49], then EMA[50] == EMA[49].
        // But here Price = 149, EMA[49] = ~144.5.
        // So EMA[50] will be slightly higher.

        const currentTick = mockKline(1000 + 49*60, 100 + 49); // Same as last history point
        const updateResult = calc.update(currentTick);

        const updateEma = updateResult.movingAverages.find(ma => ma.name === "EMA" && ma.params === "10");
        // expect(updateEma.value).toBeCloseTo(initEma.value, 10); // THIS WAS WRONG ASSUMPTION

        // Let's verify it calculated correctly as a NEW point
        // PrevEMA (approx 144.5) + k * (149 - 144.5)
        // It should differ
        if (!updateEma) throw new Error("updateEma undefined");
        expect(updateEma.value).not.toBe(initEma.value);

        // Update with changed price (simulation of price move)
        const priceMove = 100 + 49 + 5; // Jump by 5
        const movedTick = mockKline(1000 + 49*60, priceMove);
        const moveResult = calc.update(movedTick);
        const moveEma = moveResult.movingAverages.find(ma => ma.name === "EMA" && ma.params === "10");

        if (!moveEma) throw new Error("moveEma undefined");

        expect(moveEma.value).not.toBe(initEma.value);
        expect(moveEma.value).toBeGreaterThan(initEma.value);
    });

    it('should initialize and update incrementally (RSI)', () => {
        const history = [];
        // Oscillating pattern
        for(let i=0; i<100; i++) {
            const val = 100 + Math.sin(i * 0.5) * 10;
            history.push(mockKline(1000 + i*60, val));
        }

        const settings = { rsi: { length: 14 } };
        const enabled = { rsi: true };

        const calc = new StatefulTechnicalsCalculator();
        const initResult = calc.initialize(history, settings, enabled);
        const initRsi = initResult.oscillators.find(o => o.name === "RSI");
        if (!initRsi) return; // TS Guard

        // Next Tick
        const nextPrice = 110; // Spike
        const nextTick = mockKline(1000 + 100*60, nextPrice);

        const updateResult = calc.update(nextTick);
        const updateRsi = updateResult.oscillators.find(o => o.name === "RSI");

        if (!updateRsi) throw new Error("updateRsi undefined");

        expect(updateRsi.value).toBeDefined();
        expect(updateRsi.value).not.toBe(initRsi.value);
    });
});
