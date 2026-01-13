import * as talib from 'talib-web';
import { Decimal } from 'decimal.js';
import type { IndicatorSettings } from '../stores/indicatorStore';
import type { Kline, TechnicalsData, IndicatorResult } from './technicalsTypes';

export type { Kline, TechnicalsData, IndicatorResult };

// Initialize talib-web WASM module
let talibReady = false;
const talibInit = talib.init().then(() => {
    talibReady = true;
    console.log('talib-web initialized successfully');
}).catch(err => {
    console.error('Failed to initialize talib-web:', err);
});

export const technicalsService = {
    async calculateTechnicals(rawKlines: any[], settings?: IndicatorSettings): Promise<TechnicalsData> {
        // Ensure talib is initialized
        if (!talibReady) {
            await talibInit;
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
        const highsNum = klines.map(k => k.high.toNumber());
        const lowsNum = klines.map(k => k.low.toNumber());
        const closesNum = klines.map(k => k.close.toNumber());
        const currentPrice = klines[klines.length - 1].close;

        // --- Oscillators ---
        const oscillators: IndicatorResult[] = [];

        try {
            // 1. RSI
            const rsiLen = settings?.rsi?.length || 14;
            const rsiSource = getSource(settings?.rsi?.source || 'close').map(d => d.toNumber());
            const rsiResult = await talib.RSI({ inReal: rsiSource, timePeriod: rsiLen });
            const rsiOutput = rsiResult?.output || [];
            const rsiVal = rsiOutput.length > 0
                ? new Decimal(rsiOutput[rsiOutput.length - 1])
                : new Decimal(0);

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
                high: highsNum,
                low: lowsNum,
                close: closesNum,
                fastK_period: stochK,
                slowK_period: stochKSmooth,
                slowD_period: stochD
            });

            let stochKVal = new Decimal(0);
            let stochDVal = new Decimal(0);

            if (stochResult && stochResult.slowK && stochResult.slowD) {
                const lastIdx = stochResult.slowK.length - 1;
                stochKVal = new Decimal(stochResult.slowK[lastIdx] || 0);
                stochDVal = new Decimal(stochResult.slowD[lastIdx] || 0);
            }

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
            const cciResult = await talib.CCI({ high: highsNum, low: lowsNum, close: closesNum, timePeriod: cciLen });
            const cciOutput = cciResult?.output || [];
            const cciVal = cciOutput.length > 0
                ? new Decimal(cciOutput[cciOutput.length - 1])
                : new Decimal(0);

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
            const adxResult = await talib.ADX({ high: highsNum, low: lowsNum, close: closesNum, timePeriod: adxSmooth });
            const adxOutput = adxResult?.output || [];
            const adxVal = adxOutput.length > 0
                ? new Decimal(adxOutput[adxOutput.length - 1])
                : new Decimal(0);

            // Get +DI and -DI for action
            const pdiResult = await talib.PLUS_DI({ high: highsNum, low: lowsNum, close: closesNum, timePeriod: adxSmooth });
            const mdiResult = await talib.MINUS_DI({ high: highsNum, low: lowsNum, close: closesNum, timePeriod: adxSmooth });

            const pdiOutput = pdiResult?.output || [];
            const mdiOutput = mdiResult?.output || [];
            const pdi = pdiOutput.length > 0 ? pdiOutput[pdiOutput.length - 1] : 0;
            const mdi = mdiOutput.length > 0 ? mdiOutput[mdiOutput.length - 1] : 0;

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

            // 5. Awesome Oscillator (nicht in talib-web)
            const aoFast = settings?.ao?.fastLength || 5;
            const aoSlow = settings?.ao?.slowLength || 34;
            const aoVal = await this.calculateAwesomeOscillator(highsNum, lowsNum, aoFast, aoSlow);

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
            const momSource = getSource(settings?.momentum?.source || 'close').map(d => d.toNumber());
            const momResult = await talib.MOM({ inReal: momSource, timePeriod: momLen });
            const momOutput = momResult?.output || [];
            const momVal = momOutput.length > 0
                ? new Decimal(momOutput[momOutput.length - 1])
                : new Decimal(0);

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
            const macdSource = getSource(settings?.macd?.source || 'close').map(d => d.toNumber());

            const macdResult = await talib.MACD({
                inReal: macdSource,
                fastPeriod: macdFast,
                slowPeriod: macdSlow,
                signalPeriod: macdSig
            });

            let macdVal = new Decimal(0);
            let macdSignalVal = new Decimal(0);
            let macdAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';

            if (macdResult && macdResult.MACD && macdResult.MACDSignal) {
                const lastIdx = macdResult.MACD.length - 1;
                const macd = macdResult.MACD[lastIdx];
                const signal = macdResult.MACDSignal[lastIdx];

                macdVal = new Decimal(macd || 0);
                macdSignalVal = new Decimal(signal || 0);

                if (macd !== undefined && signal !== undefined) {
                    if (macd > signal) macdAction = 'Buy';
                    else if (macd < signal) macdAction = 'Sell';
                }
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

            const periods = [ema1, ema2, ema3];

            for (const period of periods) {
                const emaResult = await talib.EMA({ inReal: closesNum, timePeriod: period });
                const emaOutput = emaResult?.output || [];

                if (emaOutput.length > 0) {
                    const emaVal = new Decimal(emaOutput[emaOutput.length - 1]);

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
    async calculateAwesomeOscillator(high: number[], low: number[], fastPeriod: number, slowPeriod: number): Promise<Decimal> {
        try {
            // AO = SMA(HL2, 5) - SMA(HL2, 34)
            const hl2 = high.map((h, i) => (h + low[i]) / 2);

            const fastSMA = await talib.SMA({ inReal: hl2, timePeriod: fastPeriod });
            const slowSMA = await talib.SMA({ inReal: hl2, timePeriod: slowPeriod });

            const fastOutput = fastSMA?.output || [];
            const slowOutput = slowSMA?.output || [];

            if (fastOutput.length > 0 && slowOutput.length > 0) {
                const lastFast = fastOutput[fastOutput.length - 1];
                const lastSlow = slowOutput[slowOutput.length - 1];
                return new Decimal(lastFast - lastSlow);
            }
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
