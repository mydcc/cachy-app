import { RSI, MACD, Stochastic, CCI, ADX, AwesomeOscillator, SMA, EMA } from 'technicalindicators';
import { Decimal } from 'decimal.js';
import type { IndicatorSettings } from '../stores/indicatorStore';
import { indicators } from '../utils/indicators';
import type { Kline, TechnicalsData, IndicatorResult } from './technicalsTypes';

export type { Kline, TechnicalsData, IndicatorResult };

export const technicalsService = {
    calculateTechnicals(rawKlines: any[], settings?: IndicatorSettings): TechnicalsData {
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

        const currentPrice = klines[klines.length - 1].close;

        // --- Oscillators ---
        const oscillators: IndicatorResult[] = [];

        // 1. RSI
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSource(settings?.rsi?.source || 'close');
        const rsiVal = indicators.calculateRSI(rsiSource, rsiLen);

        oscillators.push({
            name: `RSI (${rsiLen})`,
            value: rsiVal ?? new Decimal(0),
            action: this.getRsiAction(rsiVal)
        });

        // 2. Stochastic
        const stochK = settings?.stochastic?.kPeriod || 14;
        const stochD = settings?.stochastic?.dPeriod || 3;
        const stochKSmooth = settings?.stochastic?.kSmoothing || 1; // Default 1 = No smoothing (Fast %K)

        // Convert Decimals to Numbers for library
        const highsNum = klines.map(k => k.high.toNumber());
        const lowsNum = klines.map(k => k.low.toNumber());
        const closesNum = klines.map(k => k.close.toNumber());

        // We calculate basic Stochastic first
        // Library returns { k, d } where d is SMA(k, signalPeriod)
        const stochValues = Stochastic.calculate({
            high: highsNum,
            low: lowsNum,
            close: closesNum,
            period: stochK,
            signalPeriod: stochD
        });

        let stochKVal = new Decimal(0);
        let stochDVal = new Decimal(0);

        if (stochValues.length > 0) {
            if (stochKSmooth > 1) {
                // Apply Smoothing to K values
                const rawKValues = stochValues.map(v => v.k);
                // Use library SMA for smoothing (trading view uses SMA for %K smoothing usually)
                const smoothedKValues = SMA.calculate({ values: rawKValues, period: stochKSmooth });

                if (smoothedKValues.length > 0) {
                    const lastSmoothedK = smoothedKValues[smoothedKValues.length - 1];
                    stochKVal = new Decimal(lastSmoothedK);

                    // Recalculate D based on Smoothed K
                    // D is SMA of K with period D
                    // We need the history of Smoothed K to calculate D
                    const smoothedDValues = SMA.calculate({ values: smoothedKValues, period: stochD });
                    const lastSmoothedD = smoothedDValues[smoothedDValues.length - 1];
                    stochDVal = lastSmoothedD !== undefined ? new Decimal(lastSmoothedD) : new Decimal(0);
                }
            } else {
                // No K Smoothing (Fast Stochastic)
                const lastStoch = stochValues[stochValues.length - 1];
                stochKVal = new Decimal(lastStoch.k);
                stochDVal = new Decimal(lastStoch.d);
            }
        }

        let stochAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (stochKVal.lt(20) && stochDVal.lt(20) && stochKVal.gt(stochDVal)) stochAction = 'Buy';
        else if (stochKVal.gt(80) && stochDVal.gt(80) && stochKVal.lt(stochDVal)) stochAction = 'Sell';

        oscillators.push({
            name: `Stoch (${stochK}, ${stochKSmooth}, ${stochD})`,
            value: stochKVal,
            action: stochAction
        });

        // 3. CCI
        const cciLen = settings?.cci?.length || 20;
        const cciSourceType = settings?.cci?.source || 'close'; // Now used? Wait, CCI library usually uses typical price.
        // Library CCI signature: { high, low, close, period }. It calculates TP internally.
        // If we want custom source, we might need a custom implementation, but TV CCI usually uses TP (HLC3).
        // The screenshot shows Source dropdown for CCI.
        // If user selects "Close", CCI should use Close instead of TP?
        // Standard CCI is (TP - SMA(TP)) / (0.015 * MeanDev).
        // If Source is Close, it becomes (Close - SMA(Close)) / ...
        // We will respect source if possible. The Library doesn't easily support custom source for standard CCI call.
        // But we can trick it? No, it expects high/low/close.
        // Custom CCI implementation for custom source:
        // CCI = (Source - SMA(Source, N)) / (0.015 * MeanDev(Source, N))

        const cciSource = getSource(cciSourceType);
        const cciSourceNum = cciSource.map(d => d.toNumber());
        const cciThreshold = settings?.cci?.threshold || 100;
        const cciSmoothType = settings?.cci?.smoothingType || 'sma';
        const cciSmoothLen = settings?.cci?.smoothingLength || 14;

        // Custom CCI Calculation to support Source
        const cciValues = this.calculateCCI(cciSourceNum, cciLen);
        const lastCci = cciValues[cciValues.length - 1];

        // Smoothing
        let cciSignalVal = new Decimal(0);
        if (cciValues.length >= cciSmoothLen) {
             const smoothFn = cciSmoothType === 'ema' ? EMA.calculate : SMA.calculate;
             const smoothed = smoothFn({ values: cciValues, period: cciSmoothLen });
             const lastSmooth = smoothed[smoothed.length - 1];
             if (lastSmooth !== undefined) cciSignalVal = new Decimal(lastSmooth);
        }

        let cciAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const cciVal = lastCci !== undefined ? new Decimal(lastCci) : new Decimal(0);

        if (cciVal.lt(-cciThreshold)) cciAction = 'Buy';
        else if (cciVal.gt(cciThreshold)) cciAction = 'Sell';

        oscillators.push({
            name: `CCI (${cciLen})`,
            value: cciVal,
            signal: cciSignalVal,
            action: cciAction
        });

        // 4. ADX (Custom implementation to support separate DI Length)
        const adxSmooth = settings?.adx?.adxSmoothing || 14; // Default to old length if missing
        const diLen = settings?.adx?.diLength || 14;
        const adxThreshold = settings?.adx?.threshold || 25;

        // Custom ADX Calculation
        const adxResult = this.calculateADX(highsNum, lowsNum, closesNum, diLen, adxSmooth);

        let adxAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const adxVal = new Decimal(adxResult.adx);

        if (adxResult.adx > adxThreshold) {
            if (adxResult.pdi > adxResult.mdi) adxAction = 'Buy';
            else if (adxResult.mdi > adxResult.pdi) adxAction = 'Sell';
        }

        oscillators.push({
            name: `ADX (${adxSmooth}, ${diLen})`,
            value: adxVal,
            action: adxAction
        });

        // 5. Awesome Oscillator
        const aoFast = settings?.ao?.fastLength || 5;
        const aoSlow = settings?.ao?.slowLength || 34;
        const aoValues = AwesomeOscillator.calculate({ high: highsNum, low: lowsNum, fastPeriod: aoFast, slowPeriod: aoSlow });
        const lastAo = aoValues[aoValues.length - 1];

        let aoAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const aoVal = lastAo !== undefined ? new Decimal(lastAo) : new Decimal(0);

        if (aoVal.gt(0)) aoAction = 'Buy';
        else if (aoVal.lt(0)) aoAction = 'Sell';

        oscillators.push({
            name: `Awesome Osc.`,
            value: aoVal,
            action: aoAction
        });

        // 6. Momentum
        const momLen = settings?.momentum?.length || 10;
        const momSource = getSource(settings?.momentum?.source || 'close');
        let momVal = new Decimal(0);
        let momAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';

        if (momSource.length > momLen) {
            const current = momSource[momSource.length - 1];
            const prev = momSource[momSource.length - 1 - momLen];
            momVal = current.minus(prev);

            if (momVal.gt(0)) momAction = 'Buy';
            else if (momVal.lt(0)) momAction = 'Sell';
        }

        oscillators.push({
            name: `Momentum (${momLen})`,
            value: momVal,
            action: momAction
        });

        // 7. MACD
        const macdFast = settings?.macd?.fastLength || 12;
        const macdSlow = settings?.macd?.slowLength || 26;
        const macdSig = settings?.macd?.signalLength || 9;
        const macdOscType = settings?.macd?.oscillatorMaType || 'ema';
        const macdSigType = settings?.macd?.signalMaType || 'ema';

        const macdSourceNum = getSource(settings?.macd?.source || 'close').map(d => d.toNumber());

        const macdValues = MACD.calculate({
            values: macdSourceNum,
            fastPeriod: macdFast,
            slowPeriod: macdSlow,
            signalPeriod: macdSig,
            SimpleMAOscillator: macdOscType === 'sma',
            SimpleMASignal: macdSigType === 'sma'
        });

        const lastMacd = macdValues[macdValues.length - 1];
        let macdAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const macdVal = lastMacd && lastMacd.MACD ? new Decimal(lastMacd.MACD) : new Decimal(0);
        const macdSignalVal = lastMacd && lastMacd.signal ? new Decimal(lastMacd.signal) : new Decimal(0);

        if (lastMacd && lastMacd.MACD !== undefined && lastMacd.signal !== undefined) {
            if (lastMacd.MACD > lastMacd.signal) macdAction = 'Buy';
            else if (lastMacd.MACD < lastMacd.signal) macdAction = 'Sell';
        }

        oscillators.push({
            name: `MACD (${macdFast}, ${macdSlow})`,
            value: macdVal,
            signal: macdSignalVal,
            action: macdAction
        });

        // --- Moving Averages ---
        const movingAverages: IndicatorResult[] = [];
        const ema1 = settings?.ema?.ema1Length || 20;
        const ema2 = settings?.ema?.ema2Length || 50;
        const ema3 = settings?.ema?.ema3Length || 200;

        const periods = [ema1, ema2, ema3];
        const closesDecimal = klines.map(k => k.close);

        periods.forEach(period => {
            const emaVal = indicators.calculateEMA(closesDecimal, period);

            if (emaVal) {
                movingAverages.push({
                    name: `EMA (${period})`,
                    value: emaVal,
                    action: currentPrice.gt(emaVal) ? 'Buy' : 'Sell'
                });
            }
        });

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

    calculateCCI(source: number[], period: number): number[] {
        // CCI = (Src - SMA(Src)) / (0.015 * MeanDev)
        // MeanDev = SMA(|Src - SMA(Src)|)

        if (source.length < period) return [];

        const sma = SMA.calculate({ values: source, period });
        // SMA array length is source.length - period + 1
        // We need to align them. source[i] corresponds to sma[i - (period-1)]

        const cci: number[] = [];

        // Start from the first valid SMA point
        for (let i = 0; i < sma.length; i++) {
            const currentSma = sma[i];
            const sourceIndex = i + (period - 1);

            // Calculate Mean Deviation for this window
            // Window is from source[i] to source[sourceIndex] inclusive?
            // SMA calculation: last point is sourceIndex. Window is [sourceIndex - period + 1, ..., sourceIndex]

            let sumDev = 0;
            for (let j = 0; j < period; j++) {
                sumDev += Math.abs(source[sourceIndex - j] - currentSma);
            }
            const meanDev = sumDev / period;

            const val = (source[sourceIndex] - currentSma) / (0.015 * meanDev);
            cci.push(val);
        }

        return cci;
    },

    calculateADX(high: number[], low: number[], close: number[], diLength: number, adxSmoothing: number): { adx: number, pdi: number, mdi: number } {
        if (high.length < diLength + adxSmoothing) return { adx: 0, pdi: 0, mdi: 0 };

        const tr: number[] = [];
        const pdm: number[] = [];
        const mdm: number[] = [];

        // 1. Calculate TR, +DM, -DM
        for (let i = 0; i < high.length; i++) {
            if (i === 0) {
                tr.push(0); // First value usually ignored or handled differently. Wilder uses simple first, then accumulate.
                // We'll mimic Library/Wilder: First TR is H-L.
                // Actually to match sequence, we need prev close.
                // Let's assume index 0 has no prev close, so TR = H-L
                tr[0] = high[0] - low[0];
                pdm.push(0);
                mdm.push(0);
                continue;
            }

            const h = high[i];
            const l = low[i];
            const pc = close[i - 1];
            const ph = high[i - 1];
            const pl = low[i - 1];

            const trueRange = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            tr.push(trueRange);

            const upMove = h - ph;
            const downMove = pl - l;

            if (upMove > downMove && upMove > 0) {
                pdm.push(upMove);
            } else {
                pdm.push(0);
            }

            if (downMove > upMove && downMove > 0) {
                mdm.push(downMove);
            } else {
                mdm.push(0);
            }
        }

        // 2. Smooth TR, +DM, -DM using Wilder's Smoothing (RMA) over diLength
        const smoothTr = this.rma(tr, diLength);
        const smoothPdm = this.rma(pdm, diLength);
        const smoothMdm = this.rma(mdm, diLength);

        // 3. Calculate DX
        // DX = 100 * |+DI - -DI| / (+DI + -DI)
        // +DI = 100 * SmoothPdm / SmoothTr
        const dx: number[] = [];
        let pdi = 0;
        let mdi = 0;

        // Ensure arrays align. RMA returns array shorter by (period-1) ?
        // My RMA impl returns same length, filling first (period-1) with null/partial?
        // Let's check RMA impl below.

        const offset = diLength - 1; // Basic valid index start

        for (let i = 0; i < smoothTr.length; i++) {
            const sTr = smoothTr[i];
            const sPdm = smoothPdm[i];
            const sMdm = smoothMdm[i];

            if (sTr && sTr > 0) {
                pdi = 100 * sPdm / sTr;
                mdi = 100 * sMdm / sTr;
                const sum = pdi + mdi;
                const val = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi) / sum);
                dx.push(val);
            } else {
                dx.push(0);
            }
        }

        // 4. ADX = RMA of DX over adxSmoothing
        // Note: DX is calculated starting from index 'offset'.
        // The first valid DX is at index 'offset'.
        // So we really only have valid DX data from there.
        // But for simplicity, we kept array aligned (0 values at start).
        // RMA should handle it if we slice or handle 0s?
        // Wilder's usually starts calculation after period data is available.

        // Let's pass the whole DX array to RMA. The early 0s might skew it if not handled,
        // but classical RMA initialization is usually SMA of first N values.

        // To be precise: We should take DX values starting from where they are valid.
        const validDx = dx.slice(diLength - 1);
        const smoothDx = this.rma(validDx, adxSmoothing);

        const lastAdx = smoothDx[smoothDx.length - 1];

        return {
            adx: lastAdx || 0,
            pdi,
            mdi
        };
    },

    // Wilder's Smoothing (RMA)
    // First value is SMA of first 'period' values.
    // Subsequent: (Prev * (period - 1) + Curr) / period
    rma(values: number[], period: number): number[] {
        const result: number[] = [];
        if (values.length < period) return result;

        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += values[i];
        }
        const firstVal = sum / period;

        // Fill initial gaps with 0 or null?
        // We'll align result to end of window.
        // i.e. result[0] corresponds to input[period-1]
        // But to keep arrays index-aligned with input (for easy access):
        // We push nulls/0s?
        // Let's align to match input length.
        for(let i=0; i < period - 1; i++) result.push(0);

        result.push(firstVal);

        for (let i = period; i < values.length; i++) {
            const prev = result[i - 1];
            const curr = values[i];
            const val = (prev * (period - 1) + curr) / period;
            result.push(val);
        }

        return result;
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
