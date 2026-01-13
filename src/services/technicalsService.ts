import * as talib from 'talib-web';
import { Decimal } from 'decimal.js';
import { browser } from '$app/environment';
import talibWasmUrl from 'talib-web/lib/talib.wasm?url';
import type { IndicatorSettings } from '../stores/indicatorStore';
import type { Kline, TechnicalsData, IndicatorResult } from './technicalsTypes';

export type { Kline, TechnicalsData, IndicatorResult };

// Initialize talib-web WASM module
let talibReady = false;
// Explicitly point to the WASM file using Vite asset URL
const wasmPath = browser ? talibWasmUrl : undefined;
const talibInit = talib.init(wasmPath).then(() => {
    talibReady = true;
    console.log(`talib-web initialized successfully from ${wasmPath}`);
}).catch(err => {
    console.error(`Failed to initialize talib-web form ${wasmPath}:`, err);
});

export const technicalsService = {
    async calculateTechnicals(rawKlines: any[], settings?: IndicatorSettings): Promise<TechnicalsData> {
        // Ensure talib is initialized
        if (!talibReady) {
            console.log('Waiting for talib-web initialization...');

            try {
                await talibInit;
                if (!talibReady) {
                    console.error('talib-web initialization failed or timed out.');
                    return this.getEmptyData();
                }
            } catch (e) {
                console.error('Error awaiting talibInit:', e);
                return this.getEmptyData();
            }
        }

        // 1. Normalize Data to strict Kline format with Decimals
        const klines: Kline[] = [];
        let prevClose = new Decimal(0);

        rawKlines.forEach((k, index) => {
            const time = Number(k.time || k.ts || 0);

            // Helper to safe convert
            const toDec = (val: any, fallback: Decimal): Decimal => {
                if (val instanceof Decimal) return val;
                if (val === undefined || val === null || val === '') return fallback;
                const d = new Decimal(val);
                return d.isFinite() ? d : fallback;
            };

            const close = toDec(k.close, prevClose);
            const safeClose = close.isZero() && !prevClose.isZero() ? prevClose : close;

            const open = toDec(k.open, safeClose);
            const high = toDec(k.high, safeClose);
            const low = toDec(k.low, safeClose);
            const volume = toDec(k.volume, new Decimal(0));

            if (!safeClose.isZero()) {
                klines.push({
                    open, high, low, close: safeClose, volume, time
                });
                prevClose = safeClose;
            }
        });

        if (klines.length < 2) {
            return this.getEmptyData();
        }

        // Helper to get source array based on config (returns Decimal[])
        const getSource = (sourceType: string): Decimal[] => {
            switch (sourceType) {
                case 'open': return klines.map(k => k.open);
                case 'high': return klines.map(k => k.high);
                case 'low': return klines.map(k => k.low);
                case 'hl2': return klines.map(k => k.high.plus(k.low).div(2));
                case 'hlc3': return klines.map(k => k.high.plus(k.low).plus(k.close).div(3));
                default: return klines.map(k => k.close);
            }
        };

        // Convert Decimal arrays to number arrays for talib
        const highsNum = new Float64Array(klines.map(k => k.high.toNumber()));
        const lowsNum = new Float64Array(klines.map(k => k.low.toNumber()));
        const closesNum = new Float64Array(klines.map(k => k.close.toNumber()));
        const currentPrice = klines[klines.length - 1].close;

        console.log(`[Technicals] Input Klines Count: ${klines.length}`);
        console.log(`[Technicals] Sample Prices (First 3):`, Array.from(closesNum.slice(0, 3)));
        console.log(`[Technicals] Sample Prices (Last 3):`, Array.from(closesNum.slice(-3)));
        console.log(`[Technicals] talibReady Status: ${talibReady}`);

        // Helper to extract value from talib result
        const getVal = (res: any, name: string = 'Indicator', key: string = 'output'): Decimal => {
            if (!res) {
                console.log(`[Technicals] ${name} result is null/undefined`);
                return new Decimal(0);
            }
            const arr = res[key] || res.outReal || res.output || [];
            if (arr.length === 0) {
                console.log(`[Technicals] ${name} result array is empty`);
                return new Decimal(0);
            }

            // Find last non-zero, non-NaN value
            let lastVal = 0;
            let found = false;
            for (let i = arr.length - 1; i >= 0; i--) {
                const v = arr[i];
                if (v !== 0 && !isNaN(v) && v !== undefined && v !== null) {
                    lastVal = v;
                    found = true;
                    // console.log(`[Technicals] ${name} found valid value ${v} at index ${i}/${arr.length-1}`);
                    break;
                }
            }

            if (!found) {
                console.log(`[Technicals] ${name} - NO VALID VALUE FOUND in array of length ${arr.length}. Sample (Last 5):`, arr.slice(-5));
            } else {
                // Periodisches Loggen zur Diagnose (z.B. nur alle X Aufrufe oder bei Bedarf)
                // console.log(`[Technicals] ${name} - Last Value: ${lastVal}, Array Length: ${arr.length}`);
            }

            return new Decimal(lastVal);
        };

        // Debug: Check input data
        console.log(`Calculating technicals for ${klines.length} candles. Last close: ${currentPrice}`);

        // --- Oscillators ---
        const oscillators: IndicatorResult[] = [];

        try {
            // 1. RSI
            const rsiLen = settings?.rsi?.length || 14;
            const rsiSource = new Float64Array(getSource(settings?.rsi?.source || 'close').map(d => d.toNumber()));

            console.log(`[Technicals] RSI Input Length: ${rsiSource.length}, Sample:`, Array.from(rsiSource.slice(-3)));

            const rsiResult = await talib.RSI({ inReal: Array.from(rsiSource), timePeriod: rsiLen });

            console.log('[Technicals] RSI Result Raw:', rsiResult);
            if (rsiResult?.output) {
                console.log('[Technicals] RSI Output Sample (Indices 14-19):', rsiResult.output.slice(14, 20));
                console.log('[Technicals] RSI Output Sample (Indices 190-199):', rsiResult.output.slice(190, 201));
                console.log('[Technicals] RSI Output Sample (Last 5):', rsiResult.output.slice(-5));
            }

            const rsiVal = getVal(rsiResult, 'RSI', 'output');
            console.log('[Technicals] RSI Final Value:', rsiVal.toString());

            oscillators.push({
                name: 'RSI',
                params: `${rsiLen}`,
                value: rsiVal,
                action: this.getRsiAction(rsiVal)
            });

            // 2. Stochastic
            const stochK = settings?.stochastic?.kPeriod || 14;
            const stochD = settings?.stochastic?.dPeriod || 3;
            const stochKSmooth = settings?.stochastic?.kSmoothing || 1;

            const stochResult = await talib.STOCH({
                high: Array.from(highsNum),
                low: Array.from(lowsNum),
                close: Array.from(closesNum),
                fastK_Period: stochK,
                slowK_Period: stochKSmooth,
                slowD_Period: stochD
            });

            const stochKVal = getVal(stochResult, 'StochK', 'slowK');
            const stochDVal = getVal(stochResult, 'StochD', 'slowD');

            let stochAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
            if (stochKVal.lt(20) && stochDVal.lt(20) && stochKVal.gt(stochDVal)) stochAction = 'Buy';
            else if (stochKVal.gt(80) && stochDVal.gt(80) && stochKVal.lt(stochDVal)) stochAction = 'Sell';

            oscillators.push({
                name: 'Stoch',
                params: `${stochK}, ${stochKSmooth}, ${stochD}`,
                value: stochKVal,
                action: stochAction
            });

            // 3. CCI
            const cciLen = settings?.cci?.length || 20;
            const cciResult = await talib.CCI({
                high: Array.from(highsNum),
                low: Array.from(lowsNum),
                close: Array.from(closesNum),
                timePeriod: cciLen
            });
            const cciVal = getVal(cciResult, 'CCI');

            const cciThreshold = settings?.cci?.threshold || 100;
            let cciAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
            if (cciVal.lt(-cciThreshold)) cciAction = 'Buy';
            else if (cciVal.gt(cciThreshold)) cciAction = 'Sell';

            oscillators.push({
                name: 'CCI',
                params: `${cciLen}`,
                value: cciVal,
                action: cciAction
            });

            // 4. ADX
            const adxSmooth = settings?.adx?.adxSmoothing || 14;
            const adxResult = await talib.ADX({
                high: Array.from(highsNum),
                low: Array.from(lowsNum),
                close: Array.from(closesNum),
                timePeriod: adxSmooth
            });
            const adxVal = getVal(adxResult, 'ADX');

            // Get +DI and -DI for action
            const pdiResult = await talib.PLUS_DI({
                high: Array.from(highsNum),
                low: Array.from(lowsNum),
                close: Array.from(closesNum),
                timePeriod: adxSmooth
            });
            const mdiResult = await talib.MINUS_DI({
                high: Array.from(highsNum),
                low: Array.from(lowsNum),
                close: Array.from(closesNum),
                timePeriod: adxSmooth
            });

            const pdi = getVal(pdiResult, 'PDI').toNumber();
            const mdi = getVal(mdiResult, 'MDI').toNumber();

            const adxThreshold = settings?.adx?.threshold || 25;
            let adxAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';

            if (adxVal.toNumber() > adxThreshold) {
                if (pdi > mdi) adxAction = 'Buy';
                else if (mdi > pdi) adxAction = 'Sell';
            }

            oscillators.push({
                name: 'ADX',
                params: `${adxSmooth}`,
                value: adxVal,
                action: adxAction
            });

            // 5. Awesome Oscillator (manually calculated)
            const aoFast = settings?.ao?.fastLength || 5;
            const aoSlow = settings?.ao?.slowLength || 34;
            const aoVal = await this.calculateAwesomeOscillator(highsNum, lowsNum, aoFast, aoSlow);

            console.log(`[Technicals] Awesome Oscillator (${aoFast}, ${aoSlow}) Final Value: ${aoVal.toString()}`);

            let aoAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
            if (aoVal.gt(0)) aoAction = 'Buy';
            else if (aoVal.lt(0)) aoAction = 'Sell';

            oscillators.push({
                name: 'Awesome Osc.',
                params: `${aoFast}, ${aoSlow}`,
                value: aoVal,
                action: aoAction
            });

            // 6. Momentum
            const momLen = settings?.momentum?.length || 10;
            const momSource = new Float64Array(getSource(settings?.momentum?.source || 'close').map(d => d.toNumber()));
            const momResult = await talib.MOM({ inReal: Array.from(momSource), timePeriod: momLen });
            const momVal = getVal(momResult, 'Momentum', 'output');

            let momAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
            if (momVal.gt(0)) momAction = 'Buy';
            else if (momVal.lt(0)) momAction = 'Sell';

            oscillators.push({
                name: 'Momentum',
                params: `${momLen}`,
                value: momVal,
                action: momAction
            });

            // 7. MACD
            const macdFast = settings?.macd?.fastLength || 12;
            const macdSlow = settings?.macd?.slowLength || 26;
            const macdSig = settings?.macd?.signalLength || 9;
            const macdSource = new Float64Array(getSource(settings?.macd?.source || 'close').map(d => d.toNumber()));

            const macdResult = await talib.MACD({
                inReal: Array.from(macdSource),
                fastPeriod: macdFast,
                slowPeriod: macdSlow,
                signalPeriod: macdSig
            });

            const macdVal = getVal(macdResult, 'MACD', 'MACD');
            const macdSignalVal = getVal(macdResult, 'MACDSignal', 'MACDSignal');

            let macdAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
            if (!macdVal.isZero() || !macdSignalVal.isZero()) {
                if (macdVal.gt(macdSignalVal)) macdAction = 'Buy';
                else if (macdVal.lt(macdSignalVal)) macdAction = 'Sell';
            }

            oscillators.push({
                name: 'MACD',
                params: `${macdFast}, ${macdSlow}, ${macdSig}`,
                value: macdVal,
                signal: macdSignalVal,
                action: macdAction
            });

        } catch (error) {
            console.error('Error calculating oscillators:', error);
        }

        // --- Moving Averages ---
        const movingAverages: IndicatorResult[] = [];
        try {
            const ema1 = settings?.ema?.ema1Length || 20;
            const ema2 = settings?.ema?.ema2Length || 50;
            const ema3 = settings?.ema?.ema3Length || 200;

            const emaPeriods = [ema1, ema2, ema3]; // Renamed 'periods' to 'emaPeriods' to avoid conflict if 'periods' was used elsewhere

            for (const period of emaPeriods) {
                const emaResult = await talib.EMA({ inReal: Array.from(closesNum), timePeriod: period });
                const emaVal = getVal(emaResult, `EMA(${period})`);

                console.log(`[Technicals] EMA(${period}) Result Raw:`, emaResult);
                console.log(`[Technicals] EMA(${period}) Final Value: ${emaVal.toString()}`);

                if (!emaVal.isZero()) {
                    movingAverages.push({
                        name: 'EMA',
                        params: `${period}`,
                        value: emaVal,
                        action: currentPrice.gt(emaVal) ? 'Buy' : 'Sell'
                    });
                }
            }
        } catch (error) {
            console.error('Error calculating moving averages:', error);
        }

        // --- Pivots ---
        const pivotType = settings?.pivots?.type || 'classic';
        const pivotData = this.calculatePivots(klines, pivotType);

        // --- Summary ---
        let buy = 0;
        let sell = 0;
        let neutral = 0;

        [...oscillators, ...movingAverages].forEach(ind => {
            if (ind.action === 'Buy') buy++;
            else if (ind.action === 'Sell') sell++;
            else neutral++;
        });

        let summaryAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (buy > sell && buy > neutral) summaryAction = 'Buy';
        else if (sell > buy && sell > neutral) summaryAction = 'Sell';

        return {
            oscillators,
            movingAverages,
            pivots: pivotData.pivots,
            pivotBasis: pivotData.basis,
            summary: { buy, sell, neutral, action: summaryAction }
        };
    },

    // --- Helpers ---

    // Awesome Oscillator (nicht in talib-web)
    async calculateAwesomeOscillator(high: number[] | Float64Array, low: number[] | Float64Array, fastPeriod: number, slowPeriod: number): Promise<Decimal> {
        try {
            const h = Array.from(high);
            const l = Array.from(low);
            const hl2 = h.map((val, i) => (val + l[i]) / 2);

            const getSMA = (data: number[], period: number): number => {
                if (data.length < period) return 0;
                let sum = 0;
                for (let i = data.length - period; i < data.length; i++) {
                    sum += data[i];
                }
                return sum / period;
            };

            const fastSMA = getSMA(hl2, fastPeriod);
            const slowSMA = getSMA(hl2, slowPeriod);

            console.log(`[Technicals] AO Internal: fastSMA=${fastSMA}, slowSMA=${slowSMA}, diff=${fastSMA - slowSMA}`);

            return new Decimal(fastSMA - slowSMA);
        } catch (error) {
            console.error('Error calculating Awesome Oscillator:', error);
        }
        return new Decimal(0);
    },

    calculatePivots(klines: Kline[], type: string) {
        const emptyResult = {
            pivots: {
                classic: {
                    p: new Decimal(0), r1: new Decimal(0), r2: new Decimal(0), r3: new Decimal(0),
                    s1: new Decimal(0), s2: new Decimal(0), s3: new Decimal(0)
                }
            },
            basis: { high: new Decimal(0), low: new Decimal(0), close: new Decimal(0), open: new Decimal(0) }
        };

        if (klines.length < 2) return emptyResult;
        const prev = klines[klines.length - 2];
        if (prev.close.isZero()) return emptyResult;

        const high = prev.high;
        const low = prev.low;
        const close = prev.close;
        const open = prev.open;

        let p = new Decimal(0);
        let r1 = new Decimal(0), r2 = new Decimal(0), r3 = new Decimal(0);
        let s1 = new Decimal(0), s2 = new Decimal(0), s3 = new Decimal(0);

        if (type === 'woodie') {
            p = high.plus(low).plus(close.times(2)).div(4);
            r1 = p.times(2).minus(low);
            r2 = p.plus(high).minus(low);
            s1 = p.times(2).minus(high);
            s2 = p.minus(high).plus(low);
            r3 = high.plus(p.minus(low).times(2));
            s3 = low.minus(high.minus(p).times(2));

        } else if (type === 'camarilla') {
            const range = high.minus(low);
            r3 = close.plus(range.times(1.1).div(4));
            r2 = close.plus(range.times(1.1).div(6));
            r1 = close.plus(range.times(1.1).div(12));
            p = close;
            s1 = close.minus(range.times(1.1).div(12));
            s2 = close.minus(range.times(1.1).div(6));
            s3 = close.minus(range.times(1.1).div(4));

        } else if (type === 'fibonacci') {
            p = high.plus(low).plus(close).div(3);
            const range = high.minus(low);
            r1 = p.plus(range.times(0.382));
            r2 = p.plus(range.times(0.618));
            r3 = p.plus(range.times(1.000));
            s1 = p.minus(range.times(0.382));
            s2 = p.minus(range.times(0.618));
            s3 = p.minus(range.times(1.000));

        } else {
            p = high.plus(low).plus(close).div(3);
            r1 = p.times(2).minus(low);
            s1 = p.times(2).minus(high);
            r2 = p.plus(high.minus(low));
            s2 = p.minus(high.minus(low));
            r3 = high.plus(p.minus(low).times(2));
            s3 = low.minus(high.minus(p).times(2));
        }

        return {
            pivots: {
                classic: { p, r1, r2, r3, s1, s2, s3 }
            },
            basis: { high, low, close, open }
        };
    },

    getRsiAction(val: Decimal | null): 'Buy' | 'Sell' | 'Neutral' {
        if (!val) return 'Neutral';
        if (val.gte(70)) return 'Sell';
        if (val.lte(30)) return 'Buy';
        return 'Neutral';
    },

    getEmptyData(): TechnicalsData {
        return {
            oscillators: [],
            movingAverages: [],
            pivots: {
                classic: {
                    p: new Decimal(0), r1: new Decimal(0), r2: new Decimal(0), r3: new Decimal(0),
                    s1: new Decimal(0), s2: new Decimal(0), s3: new Decimal(0)
                }
            },
            pivotBasis: { high: new Decimal(0), low: new Decimal(0), close: new Decimal(0), open: new Decimal(0) },
            summary: { buy: 0, sell: 0, neutral: 0, action: 'Neutral' }
        };
    }
};
