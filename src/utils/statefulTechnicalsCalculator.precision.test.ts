// @vitest-environment node
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

/**
 * BUG-0426 containment: the stateful technicals graph is f64 by design
 * (chart overlays, signal scores, alert thresholds). Its outputs must never
 * feed financial arithmetic, and the Decimal→number entry point must stay a
 * single, documented boundary instead of sprouting new toNumber() sites.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Decimal } from 'decimal.js';
import { StatefulTechnicalsCalculator } from './statefulTechnicalsCalculator';
import { JSIndicators, type Kline } from './indicators';

const CALC_SOURCE = new URL('./statefulTechnicalsCalculator.ts', import.meta.url).pathname;
const TRADE_SERVICE_SOURCE = new URL('../services/tradeService.ts', import.meta.url).pathname;
const CALCULATOR_SOURCE = new URL('../lib/calculator.ts', import.meta.url).pathname;

function mockKline(time: number, close: string): Kline {
    return {
        time,
        open: new Decimal(close),
        high: new Decimal(close),
        low: new Decimal(close),
        close: new Decimal(close),
        volume: new Decimal(100)
    } as Kline;
}

describe('BUG-0426 f64 containment', () => {
    it('update() consumes the tick close at full f64 fidelity, nothing less', () => {
        const history: Kline[] = [];
        for (let i = 0; i < 50; i++) {
            history.push(mockKline(1000 + i * 60, '67432.187'));
        }

        const calc = new StatefulTechnicalsCalculator();
        const initResult = calc.initialize(history, { ema: { ema1: { length: 10 } } });
        const initEma = initResult.movingAverages.find(ma => ma.name === 'EMA' && ma.params === '10');
        if (!initEma) throw new Error('initEma undefined');

        const tick = mockKline(1000 + 49 * 60, '67455.321');
        const updateResult = calc.update(tick);
        const updateEma = updateResult.movingAverages.find(ma => ma.name === 'EMA' && ma.params === '10');
        if (!updateEma) throw new Error('updateEma undefined');

        // Reference built from the exact Decimal entry value — any truncation
        // or rounding inside the boundary helper breaks this equality.
        const expected = JSIndicators.updateEma(initEma.value, tick.close.toNumber(), 10);
        expect(updateEma.value).toBe(expected);
    });

    it('has exactly one Decimal→number conversion site: the documented boundary', () => {
        const source = readFileSync(CALC_SOURCE, 'utf8');
        const sites = source.match(/\.toNumber\(\)/g) ?? [];
        expect(sites.length).toBe(1);
        expect(source).toContain('toDisplayPrice');
    });

    it('financial arithmetic never imports technicals outputs', () => {
        for (const file of [TRADE_SERVICE_SOURCE, CALCULATOR_SOURCE]) {
            const source = readFileSync(file, 'utf8');
            expect(source).not.toMatch(/from\s+['"][^'"]*technicals/i);
        }
    });
});
