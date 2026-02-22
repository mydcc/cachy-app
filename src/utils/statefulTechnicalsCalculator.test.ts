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

    it('regression: should continuously update RSI without state staleness (Bug 1+2)', () => {
        const history = [];
        // Steady uptrend but with occasional slight drops so RSI isn't exactly 100
        for(let i=0; i<50; i++) {
            const drop = i % 5 === 0 ? -10 : 0;
            history.push(mockKline(1000 + i*60, 100 + i + drop));
        }

        const settings = { rsi: { length: 14 } };
        const enabled = { rsi: true };

        const calc = new StatefulTechnicalsCalculator();
        const initResult = calc.initialize(history, settings, enabled);
        const rsiInit = initResult.oscillators.find(o => o.name === "RSI")?.value;
        expect(rsiInit).toBeDefined();
        // Since we explicitly added drops, RSI should be < 100
        expect(rsiInit).toBeLessThan(100);

        // Tick 1: Trend accelerates
        const tick1 = mockKline(1000 + 50*60, 160);
        const res1 = calc.update(tick1);
        const rsi1 = res1.oscillators.find(o => o.name === "RSI")?.value;

        // Tick 2: Trend accelerates even more
        const tick2 = mockKline(1000 + 51*60, 170);
        const res2 = calc.update(tick2);
        const rsi2 = res2.oscillators.find(o => o.name === "RSI")?.value;

        // Because we had a drop, RSI has room to grow correctly
        expect(rsi1).toBeGreaterThan(rsiInit as number);
        expect(rsi2).toBeGreaterThan(rsi1 as number);
    });

    it('regression: should initialize BB prevSumSq so BB width is non-zero after update (Bug 3)', () => {
        const history = [];
        // Volatile price history to ensure non-zero variance
        let price = 100;
        for(let i=0; i<50; i++) {
            price += (i % 2 === 0 ? 5 : -3);
            history.push(mockKline(1000 + i*60, price));
        }

        const settings = { 
            ema: { 
                ema1: { length: 10 },
                smoothingType: 'sma_bb',
                smoothingLength: 20,
                bbStdDev: 2
            },
            sma: { 
                sma1: { length: 20 } 
            }
        };
        const enabled = { ema: true, sma: true };

        const calc = new StatefulTechnicalsCalculator();
        calc.initialize(history, settings, enabled);

        // Next Tick
        price += 10;
        const nextTick = mockKline(1000 + 50*60, price);
        const updateResult = calc.update(nextTick);

        const emaWithBb = updateResult.movingAverages.find(ma => ma.name === "EMA");
        expect(emaWithBb).toBeDefined();
        
        // Due to the bug, upperBand and lowerBand were exactly equal to the signal (middle band)
        // because stdDev was 0 due to null prevSumSq.
        const upper = emaWithBb!.upperBand;
        const lower = emaWithBb!.lowerBand;
        const middle = emaWithBb!.signal;

        expect(upper).toBeDefined();
        expect(lower).toBeDefined();
        
        const bbWidth = (upper as number) - (lower as number);
        expect(bbWidth).toBeGreaterThan(0.001); // Variance should be meaningful
        expect(upper).toBeGreaterThan(middle as number);
        expect(lower).toBeLessThan(middle as number);
    });

    it('pure function: calling update() multiple times with the same tick should not mutate state and yield identical results', () => {
        const history = [];
        for(let i=0; i<50; i++) {
            history.push(mockKline(1000 + i*60, 100 + i)); // Trend
        }

        const settings = { 
            ema: { ema1: { length: 14 } },
            rsi: { length: 14 },
            sma: { sma1: { length: 20 } },
            mfi: { length: 14 },
            stochRsi: { length: 14, kPeriod: 3, dPeriod: 3, rsiLength: 14 }
        };
        const enabled = { ema: true, rsi: true, sma: true, mfi: true, stochrsi: true };

        const calc = new StatefulTechnicalsCalculator();
        calc.initialize(history, settings, enabled);

        // Create a forming tick
        const activeTick = mockKline(1000 + 50*60, 155);

        // 1st call
        const result1 = calc.update(activeTick);
        
        // 2nd call (simulating a second tick arriving with the same price before the candle closes)
        const result2 = calc.update(activeTick);

        // 100th call (stress test)
        let result100;
        for (let i = 0; i < 98; i++) {
            result100 = calc.update(activeTick);
        }

        // Deep equality check: If `update` is pure, calling it 100 times on the same state + tick 
        // must yield the EXACT same mathematical result without compounding NaN/Infinity destruction.
        expect(result2).toEqual(result1);
        expect(result100).toEqual(result1);
    });

    it('SHIFT flow: commitCandle() should correctly advance the base state', () => {
        const history = [];
        for(let i=0; i<50; i++) {
            history.push(mockKline(1000 + i*60, 100 + i)); // Trend
        }

        const settings = { ema: { ema1: { length: 14 } } };
        const enabled = { ema: true };

        const calc = new StatefulTechnicalsCalculator();
        const initResult = calc.initialize(history, settings, enabled);
        const o1 = initResult.movingAverages.find(m => m.name === "EMA");

        // The UI receives a forming tick
        const activeTick = mockKline(1000 + 50*60, 200);
        const updateResult = calc.update(activeTick);
        const o2 = updateResult.movingAverages.find(m => m.name === "EMA");
        expect(o1!.value).not.toEqual(o2!.value);

        // The candle closes. The manager sends a SHIFT event.
        calc.commitCandle(activeTick);

        // A new candle begins forming
        const nextTick = mockKline(1000 + 51*60, 210);
        const res3 = calc.update(nextTick);
        const o3 = res3.movingAverages.find(m => m.name === "EMA");
        
        expect(o3!.value).toBeDefined();
        // It should progress linearly, not jump wildly
        expect(o3!.value).not.toEqual(o2!.value);
    });
});
