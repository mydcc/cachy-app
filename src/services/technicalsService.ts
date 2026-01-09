import { RSI, MACD, Stochastic, CCI, ADX, AwesomeOscillator } from 'technicalindicators';
import { Decimal } from 'decimal.js';
import type { IndicatorSettings } from '../stores/indicatorStore';
import { indicators } from '../utils/indicators';
import type { Kline, TechnicalsData, IndicatorResult } from './technicalsTypes';

export type { Kline, TechnicalsData, IndicatorResult };

export const technicalsService = {
    calculateTechnicals(rawKlines: any[], settings?: IndicatorSettings): TechnicalsData {
        // 1. Normalize Data to strict Kline format with Decimals
        const klines: Kline[] = rawKlines.map(k => ({
            open: new Decimal(k.open?.toString() || 0),
            high: new Decimal(k.high?.toString() || 0),
            low: new Decimal(k.low?.toString() || 0),
            close: new Decimal(k.close?.toString() || 0),
            volume: new Decimal(k.volume?.toString() || 0),
            time: Number(k.time || k.ts || 0)
        }));

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

        // 1. RSI (High Precision via src/utils/indicators)
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSource(settings?.rsi?.source || 'close');

        // indicators.calculateRSI expects simple array. We pass the full history.
        const rsiVal = indicators.calculateRSI(rsiSource, rsiLen);

        // RSI is typically calculated on the 'confirmed' close, but for live dashboard we often want the 'live' RSI.
        // The indicators.calculateRSI uses the last element as the current/latest.
        // So passing the full array (including live candle) gives us the Live RSI.

        oscillators.push({
            name: `RSI (${rsiLen})`,
            value: rsiVal ?? new Decimal(0),
            action: this.getRsiAction(rsiVal)
        });

        // 2. Stochastic (Wrapped Library for now - complex math)
        const stochK = settings?.stochastic?.kPeriod || 14;
        const stochD = settings?.stochastic?.dPeriod || 3;

        // Convert Decimals to Numbers for library
        const highsNum = klines.map(k => k.high.toNumber());
        const lowsNum = klines.map(k => k.low.toNumber());
        const closesNum = klines.map(k => k.close.toNumber());

        const stochValues = Stochastic.calculate({
            high: highsNum,
            low: lowsNum,
            close: closesNum,
            period: stochK,
            signalPeriod: stochD
        });

        const lastStoch = stochValues[stochValues.length - 1];
        let stochAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        let stochKVal = new Decimal(0);

        if (lastStoch) {
            stochKVal = new Decimal(lastStoch.k);
            const stochDVal = new Decimal(lastStoch.d);

             if (stochKVal.lt(20) && stochDVal.lt(20) && stochKVal.gt(stochDVal)) stochAction = 'Buy';
             else if (stochKVal.gt(80) && stochDVal.gt(80) && stochKVal.lt(stochDVal)) stochAction = 'Sell';
        }

        oscillators.push({
            name: `Stoch (${stochK}, ${stochD}, 3)`,
            value: stochKVal,
            action: stochAction
        });

        // 3. CCI (Wrapped)
        const cciLen = settings?.cci?.length || 20;
        const cciThreshold = settings?.cci?.threshold || 100;
        const cciValues = CCI.calculate({ high: highsNum, low: lowsNum, close: closesNum, period: cciLen });
        const lastCci = cciValues[cciValues.length - 1];

        let cciAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const cciVal = lastCci !== undefined ? new Decimal(lastCci) : new Decimal(0);

        if (cciVal.lt(-cciThreshold)) cciAction = 'Buy';
        else if (cciVal.gt(cciThreshold)) cciAction = 'Sell';

        oscillators.push({
            name: `CCI (${cciLen})`,
            value: cciVal,
            action: cciAction
        });

        // 4. ADX (Wrapped)
        const adxLen = settings?.adx?.length || 14;
        const adxThreshold = settings?.adx?.threshold || 25;
        const adxValues = ADX.calculate({ high: highsNum, low: lowsNum, close: closesNum, period: adxLen });
        const lastAdx = adxValues[adxValues.length - 1];

        let adxAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        const adxVal = lastAdx ? new Decimal(lastAdx.adx) : new Decimal(0);

        if (lastAdx && lastAdx.adx > adxThreshold) {
            if (lastAdx.pdi > lastAdx.mdi) adxAction = 'Buy';
            else if (lastAdx.mdi > lastAdx.pdi) adxAction = 'Sell';
        }

        oscillators.push({
            name: `ADX (${adxLen})`,
            value: adxVal,
            action: adxAction
        });

        // 5. Awesome Oscillator (Wrapped)
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

        // 6. Momentum (Pure Decimal)
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

        // 7. MACD (Wrapped)
        const macdFast = settings?.macd?.fastLength || 12;
        const macdSlow = settings?.macd?.slowLength || 26;
        const macdSig = settings?.macd?.signalLength || 9;

        // Source conversion for library
        const macdSourceNum = getSource(settings?.macd?.source || 'close').map(d => d.toNumber());

        const macdValues = MACD.calculate({
            values: macdSourceNum,
            fastPeriod: macdFast,
            slowPeriod: macdSlow,
            signalPeriod: macdSig,
            SimpleMAOscillator: false,
            SimpleMASignal: false
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


        // --- Moving Averages (High Precision) ---
        const movingAverages: IndicatorResult[] = [];
        const ema1 = settings?.ema?.ema1Length || 20;
        const ema2 = settings?.ema?.ema2Length || 50;
        const ema3 = settings?.ema?.ema3Length || 200;

        const periods = [ema1, ema2, ema3];
        const closesDecimal = klines.map(k => k.close); // EMA/SMA usually on Close

        periods.forEach(period => {
            // Using internal precision function
            const emaVal = indicators.calculateEMA(closesDecimal, period);

            if (emaVal) {
                movingAverages.push({
                    name: `EMA (${period})`,
                    value: emaVal,
                    action: currentPrice.gt(emaVal) ? 'Buy' : 'Sell'
                });
            }
        });


        // --- Pivots (Pure Decimal & Robust Logic) ---
        // Pivot Strategy: Always use the "Last Completed Candle".
        // If the array includes the 'live' candle (which is constantly changing),
        // then the "Last Completed" is at index length-2.
        // We assume the caller sends [History ... LiveCandle].
        // Robust check: Ensure we have at least 2 candles to get a 'previous'.

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

    /**
     * Calculates Pivot Points using High Precision Decimal Math.
     * Uses the 2nd to last candle (Previous Completed) as the basis.
     */
    calculatePivots(klines: Kline[], type: string) {
        // Default safe values
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

        // "Previous Completed Candle" is at index -2
        const prev = klines[klines.length - 2];
        const high = prev.high;
        const low = prev.low;
        const close = prev.close;
        const open = prev.open;

        let p = new Decimal(0);
        let r1 = new Decimal(0), r2 = new Decimal(0), r3 = new Decimal(0);
        let s1 = new Decimal(0), s2 = new Decimal(0), s3 = new Decimal(0);

        if (type === 'woodie') {
            // Woodie: (H + L + 2 * Close) / 4
            // Note: Woodie sometimes uses Current Open, but standard formula often cites prev Close.
            // We stick to the documented formula used previously but with precision.
            p = high.plus(low).plus(close.times(2)).div(4);

            r1 = p.times(2).minus(low);
            r2 = p.plus(high).minus(low);
            s1 = p.times(2).minus(high);
            s2 = p.minus(high).plus(low);

            // Extrapolated R3/S3
            r3 = high.plus(p.minus(low).times(2));
            s3 = low.minus(high.minus(p).times(2));

        } else if (type === 'camarilla') {
            // R3 = C + Range * 1.1 / 4
            const range = high.minus(low);

            r3 = close.plus(range.times(1.1).div(4));
            r2 = close.plus(range.times(1.1).div(6));
            r1 = close.plus(range.times(1.1).div(12));

            p = close; // Camarilla focuses on levels, P is usually Close

            s1 = close.minus(range.times(1.1).div(12));
            s2 = close.minus(range.times(1.1).div(6));
            s3 = close.minus(range.times(1.1).div(4));

        } else if (type === 'fibonacci') {
            // P = (H + L + C) / 3
            p = high.plus(low).plus(close).div(3);
            const range = high.minus(low);

            r1 = p.plus(range.times(0.382));
            r2 = p.plus(range.times(0.618));
            r3 = p.plus(range.times(1.000));

            s1 = p.minus(range.times(0.382));
            s2 = p.minus(range.times(0.618));
            s3 = p.minus(range.times(1.000));

        } else {
            // Classic
            // P = (H + L + C) / 3
            p = high.plus(low).plus(close).div(3);

            // R1 = 2*P - L
            r1 = p.times(2).minus(low);
            // S1 = 2*P - H
            s1 = p.times(2).minus(high);

            // R2 = P + (H - L)
            r2 = p.plus(high.minus(low));
            // S2 = P - (H - L)
            s2 = p.minus(high.minus(low));

            // R3 = H + 2 * (P - L)
            r3 = high.plus(p.minus(low).times(2));
            // S3 = L - 2 * (H - P)
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
