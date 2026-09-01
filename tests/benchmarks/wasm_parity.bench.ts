/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * WASM engine throughput (BUG-0317).
 *
 * Measures one full initialize()+update() round trip — the shape every live
 * call uses after BUG-0315 — at the two candle counts that matter for the
 * routing-threshold decision parked in IDEA-0312. Run: `npm run benchmark:technicals`.
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Decimal } from 'decimal.js';
import { calculateAllIndicators } from '../../src/utils/technicalsCalculator';
import { indicatorState } from '../../src/stores/indicator.svelte';
import type { IndicatorSettings } from '../../src/types/indicators';

const STATIC_DIR = path.resolve(__dirname, '../../static/wasm');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let glue: any;
let server: Server;

const SETTINGS = JSON.stringify({
    sma: [{ length: 9 }],
    wma: [{ length: 12 }],
    ema: [{ length: 10 }],
    rsi: [{ length: 14 }],
    bb: [{ length: 20, std_dev: '2' }],
    stoch: [{ k: 14, d: 3, smooth: 3 }],
    hma: [{ length: 9 }],
    mfi: [{ length: 14 }],
    vwap: [{ anchor: 'session' }],
    psar: [{ start: '0.02', increment: '0.02', max: '0.2' }],
    pivots: [{ type_: 'classic' }],
});

function makeSeries(n: number) {
    let seed = 7;
    const rand = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return seed / 4_294_967_296;
    };
    const out: { c: string; h: string; l: string; o: string; v: string; t: number }[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        const t = Math.floor(i / 50) * 86_400_000 + (i % 50) * 60_000;
        const o = price;
        price = Math.max(10, price + (rand() - 0.48) * 3);
        out.push({
            o: o.toFixed(6),
            c: price.toFixed(6),
            h: (Math.max(o, price) + rand()).toFixed(6),
            l: (Math.min(o, price) - rand()).toFixed(6),
            v: (500 + rand() * 1500).toFixed(4),
            t,
        });
    }
    return out;
}

const CASES = [500, 2000].map(n => ({ n, series: makeSeries(n) }));
const tsSettings = buildTsSettings();

function roundTrip(series: ReturnType<typeof makeSeries>): void {
    const history = series.slice(0, -1);
    const last = series[series.length - 1];
    const calc = new glue.TechnicalsCalculator();
    calc.initialize(
        history.map((k: { c: string }) => k.c),
        history.map((k: { h: string }) => k.h),
        history.map((k: { l: string }) => k.l),
        history.map((k: { v: string }) => k.v),
        new Float64Array(history.map((k: { t: number }) => k.t)),
        SETTINGS,
    );
    calc.update(last.o, last.h, last.l, last.c, last.v, String(last.t));
}

// TS engine baseline — same indicator set as SETTINGS above, so the two
// engines do the same work and the routing-threshold decision (IDEA-0318 F-7)
// is apples-to-apples. Builds a full IndicatorSettings from the store defaults
// with every non-benchmarked indicator disabled.
function buildTsSettings(): IndicatorSettings {
    const s = indicatorState.toJSON();
    s.sma = { enabled: true, sma1: { length: 9 }, sma2: { length: 0 }, sma3: { length: 0 } };
    s.wma = { enabled: true, length: 12 };
    s.ema = { enabled: true, ema1: { length: 10, offset: 0, smoothingType: 'sma', smoothingLength: 14 }, ema2: { length: 0, offset: 0, smoothingType: 'sma', smoothingLength: 14 }, ema3: { length: 0, offset: 0, smoothingType: 'sma', smoothingLength: 14 }, source: 'close' };
    s.hma = { enabled: true, length: 9 };
    s.rsi = { ...s.rsi, enabled: true, length: 14 };
    s.stochastic = { enabled: true, kPeriod: 14, kSmoothing: 3, dPeriod: 3 };
    s.mfi = { enabled: true, length: 14 };
    s.vwap = { enabled: true, length: 0, anchor: 'session' };
    s.parabolicSar = { enabled: true, start: 0.02, increment: 0.02, max: 0.2 };
    s.pivots = { enabled: true, type: 'classic', viewMode: 'integrated' };
    s.bollingerBands = { enabled: true, length: 20, stdDev: 2, source: 'close' };
    // Disable everything not in SETTINGS.
    s.stochRsi.enabled = false;
    s.macd.enabled = false;
    s.stochastic = { ...s.stochastic, enabled: true };
    s.williamsR.enabled = false;
    s.cci.enabled = false;
    s.adx.enabled = false;
    s.ao.enabled = false;
    s.momentum.enabled = false;
    s.ichimoku.enabled = false;
    s.atr.enabled = false;
    s.choppiness.enabled = false;
    s.superTrend.enabled = false;
    s.atrTrailingStop.enabled = false;
    s.obv.enabled = false;
    s.volumeMa.enabled = false;
    s.volumeProfile.enabled = false;
    s.volume.enabled = false;
    s.vwma.enabled = false;
    return s;
}

function tsRoundTrip(series: ReturnType<typeof makeSeries>): void {
    const klines = series.map((k) => ({
        time: k.t,
        open: new Decimal(k.o),
        high: new Decimal(k.h),
        low: new Decimal(k.l),
        close: new Decimal(k.c),
        volume: new Decimal(k.v),
    }));
    calculateAllIndicators(klines, tsSettings);
}

beforeAll(async () => {
    if (!existsSync(path.join(STATIC_DIR, 'technicals_wasm_bg.wasm'))) {
        throw new Error('static/wasm/technicals_wasm_bg.wasm missing — run `npm run build:wasm`');
    }
    // Whitelist the generated artifacts — request URLs never reach the fs.
    const ALLOWED = new Set([
        '/technicals_wasm_bg.wasm',
        '/technicals_wasm.js',
        '/technicals_wasm.d.ts',
    ]);
    server = createServer(async (req, res) => {
        const file = req.url ?? '';
        if (!ALLOWED.has(file)) {
            res.writeHead(404);
            res.end('not found');
            return;
        }
        const bytes = await readFile(path.join(STATIC_DIR, file));
        res.writeHead(200, { 'content-type': 'application/wasm' });
        res.end(bytes);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    glue = await import(
        pathToFileURL(path.join(STATIC_DIR, 'technicals_wasm.js')).href
    );
    await glue.default({ module_or_path: `http://127.0.0.1:${port}/technicals_wasm_bg.wasm` });
});

afterAll(() => {
    server?.close();
});

describe('WASM technicals round trip', () => {
    for (const { n, series } of CASES) {
        bench(`initialize + update (${n} candles)`, () => {
            roundTrip(series);
        });
    }
});

describe('TS indicators baseline', () => {
    for (const { n, series } of CASES) {
        bench(`calculateAllIndicators (${n} candles)`, () => {
            tsRoundTrip(series);
        });
    }
});
