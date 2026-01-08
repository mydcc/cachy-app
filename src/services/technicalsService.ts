import { RSI, MACD, EMA, Stochastic } from 'technicalindicators';
import { Decimal } from 'decimal.js';
import type { IndicatorSettings } from '../stores/indicatorStore';

export interface IndicatorResult {
    name: string;
    value: number;
    action: 'Buy' | 'Sell' | 'Neutral';
}

export interface TechnicalsData {
    oscillators: IndicatorResult[];
    movingAverages: IndicatorResult[];
    pivots: {
        classic: {
            r3: number;
            r2: number;
            r1: number;
            p: number;
            s1: number;
            s2: number;
            s3: number;
        };
    };
    pivotBasis?: {
        high: number;
        low: number;
        close: number;
        open: number;
    };
    summary: {
        buy: number;
        sell: number;
        neutral: number;
        action: 'Buy' | 'Sell' | 'Neutral';
    };
}

export const technicalsService = {
    calculateTechnicals(klines: any[], settings?: IndicatorSettings): TechnicalsData {
        if (!klines || klines.length < 200) {
            // Return empty structure if not enough data
            return this.getEmptyData();
        }

        // Prepare data arrays
        const closes = klines.map(k => typeof k.close === 'object' ? k.close.toNumber() : Number(k.close));
        const opens = klines.map(k => typeof k.open === 'object' ? k.open.toNumber() : Number(k.open));
        const highs = klines.map(k => typeof k.high === 'object' ? k.high.toNumber() : Number(k.high));
        const lows = klines.map(k => typeof k.low === 'object' ? k.low.toNumber() : Number(k.low));

        // Helper to get source array based on config
        const getSource = (sourceType: string) => {
            if (sourceType === 'open') return opens;
            if (sourceType === 'high') return highs;
            if (sourceType === 'low') return lows;
            if (sourceType === 'hl2') return highs.map((h, i) => (h + lows[i]) / 2);
            if (sourceType === 'hlc3') return highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
            return closes; // default 'close'
        };

        const currentPrice = closes[closes.length - 1];

        // --- Oscillators ---
        const oscillators: IndicatorResult[] = [];

        // RSI
        const rsiLen = settings?.rsi?.length || 14;
        const rsiSource = getSource(settings?.rsi?.source || 'close');

        const rsiValues = RSI.calculate({ values: rsiSource, period: rsiLen });
        const rsi = rsiValues[rsiValues.length - 1];
        oscillators.push({
            name: `RSI (${rsiLen})`,
            value: rsi,
            action: this.getRsiAction(rsi)
        });

        // MACD
        const macdFast = settings?.macd?.fastLength || 12;
        const macdSlow = settings?.macd?.slowLength || 26;
        const macdSig = settings?.macd?.signalLength || 9;
        const macdSource = getSource(settings?.macd?.source || 'close');

        const macdValues = MACD.calculate({
            values: macdSource,
            fastPeriod: macdFast,
            slowPeriod: macdSlow,
            signalPeriod: macdSig,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        const macd = macdValues[macdValues.length - 1];
        let macdAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (macd && macd.MACD !== undefined && macd.signal !== undefined) {
            if (macd.MACD > macd.signal) macdAction = 'Buy';
            else if (macd.MACD < macd.signal) macdAction = 'Sell';
        }
        oscillators.push({
            name: `MACD (${macdFast}, ${macdSlow})`,
            value: macd && macd.MACD !== undefined ? macd.MACD : 0,
            action: macdAction
        });

        // Stochastic
        const stochK = settings?.stochastic?.kPeriod || 14;
        const stochD = settings?.stochastic?.dPeriod || 3;

        const stochValues = Stochastic.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: stochK,
            signalPeriod: stochD
        });
        const stoch = stochValues[stochValues.length - 1];
        let stochAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (stoch) {
             if (stoch.k < 20 && stoch.d < 20 && stoch.k > stoch.d) stochAction = 'Buy';
             else if (stoch.k > 80 && stoch.d > 80 && stoch.k < stoch.d) stochAction = 'Sell';
        }
        oscillators.push({
            name: `Stoch %K (${stochK}, ${stochD}, 3)`,
            value: stoch ? stoch.k : 0,
            action: stochAction
        });


        // --- Moving Averages ---
        const movingAverages: IndicatorResult[] = [];
        const ema1 = settings?.ema?.ema1Length || 20;
        const ema2 = settings?.ema?.ema2Length || 50;
        const ema3 = settings?.ema?.ema3Length || 200;

        const periods = [ema1, ema2, ema3];

        periods.forEach(period => {
            const emaValues = EMA.calculate({ values: closes, period: period });
            const ema = emaValues[emaValues.length - 1];
            if (ema) {
                movingAverages.push({
                    name: `EMA (${period})`,
                    value: ema,
                    action: currentPrice > ema ? 'Buy' : 'Sell'
                });
            }
        });

        // --- Pivots ---
        // Pivots are calculated on the PREVIOUS complete candle (High, Low, Close).
        const prevHigh = highs[highs.length - 2];
        const prevLow = lows[lows.length - 2];
        const prevClose = closes[closes.length - 2];
        const prevOpen = opens[opens.length - 2]; // Used for Woodie

        let p = 0, r1 = 0, r2 = 0, r3 = 0, s1 = 0, s2 = 0, s3 = 0;

        const pivotType = settings?.pivots?.type || 'classic';

        if (pivotType === 'woodie') {
             p = (prevHigh + prevLow + 2 * prevClose) / 4; // Or (H+L+2*OpenCurrent)? Woodie usually uses Open of current session, but often simplified.
             // Strictly Woodie: (H + L + 2 * Close) / 4
             r1 = (2 * p) - prevLow;
             r2 = p + prevHigh - prevLow;
             s1 = (2 * p) - prevHigh;
             s2 = p - prevHigh + prevLow;
             // R3/S3 not standard in basic Woodie, but we can extrapolate or leave 0
             r3 = prevHigh + 2 * (p - prevLow); // Fallback to classic-like extension
             s3 = prevLow - 2 * (prevHigh - p);
        } else if (pivotType === 'camarilla') {
             const range = prevHigh - prevLow;
             r3 = prevClose + range * 1.1 / 4;
             r2 = prevClose + range * 1.1 / 6;
             r1 = prevClose + range * 1.1 / 12;
             p = prevClose; // Camarilla doesn't use standard P but we need to fill it?
             s1 = prevClose - range * 1.1 / 12;
             s2 = prevClose - range * 1.1 / 6;
             s3 = prevClose - range * 1.1 / 4;
             // R4/S4 are major breakout levels in Camarilla, but our interface supports 3 levels.
        } else if (pivotType === 'fibonacci') {
             p = (prevHigh + prevLow + prevClose) / 3;
             const range = prevHigh - prevLow;
             r1 = p + (range * 0.382);
             r2 = p + (range * 0.618);
             r3 = p + (range * 1.000);
             s1 = p - (range * 0.382);
             s2 = p - (range * 0.618);
             s3 = p - (range * 1.000);
        } else {
             // Classic
             p = (prevHigh + prevLow + prevClose) / 3;
             r1 = 2 * p - prevLow;
             r2 = p + (prevHigh - prevLow);
             r3 = prevHigh + 2 * (p - prevLow);
             s1 = 2 * p - prevHigh;
             s2 = p - (prevHigh - prevLow);
             s3 = prevLow - 2 * (prevHigh - p);
        }

        const pivots = {
            classic: { p, r1, r2, r3, s1, s2, s3 }
        };

        const pivotBasis = {
            high: prevHigh,
            low: prevLow,
            close: prevClose,
            open: prevOpen
        };

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
            pivots,
            pivotBasis,
            summary: { buy, sell, neutral, action: summaryAction }
        };
    },

    getRsiAction(val: number): 'Buy' | 'Sell' | 'Neutral' {
        if (val >= 70) return 'Sell';
        if (val <= 30) return 'Buy';
        return 'Neutral';
    },

    getEmptyData(): TechnicalsData {
        return {
            oscillators: [],
            movingAverages: [],
            pivots: {
                classic: { p: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 }
            },
            pivotBasis: { high: 0, low: 0, close: 0, open: 0 },
            summary: { buy: 0, sell: 0, neutral: 0, action: 'Neutral' }
        };
    }
};
