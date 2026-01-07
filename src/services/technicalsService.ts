import { RSI, MACD, EMA, Stochastic } from 'technicalindicators';
import { Decimal } from 'decimal.js';

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
    summary: {
        buy: number;
        sell: number;
        neutral: number;
        action: 'Buy' | 'Sell' | 'Neutral';
    };
}

export const technicalsService = {
    calculateTechnicals(klines: any[]): TechnicalsData {
        if (!klines || klines.length < 200) {
            // Return empty structure if not enough data
            return this.getEmptyData();
        }

        // Prepare data arrays (technicalindicators expects simple number arrays)
        // Klines from Bitunix API/Service are usually objects { open, high, low, close, ... }
        // Ensure we are using CLOSE prices for most things
        const closes = klines.map(k => typeof k.close === 'object' ? k.close.toNumber() : Number(k.close));
        const highs = klines.map(k => typeof k.high === 'object' ? k.high.toNumber() : Number(k.high));
        const lows = klines.map(k => typeof k.low === 'object' ? k.low.toNumber() : Number(k.low));

        // Latest price (last closed candle or current candle?)
        // Usually technicals are based on "closed" values, but for "current" view we often use the latest tick.
        // Assuming 'klines' includes the latest candle at the end.
        const currentPrice = closes[closes.length - 1];

        // --- Oscillators ---
        const oscillators: IndicatorResult[] = [];

        // RSI (14)
        const rsiValues = RSI.calculate({ values: closes, period: 14 });
        const rsi = rsiValues[rsiValues.length - 1];
        oscillators.push({
            name: 'RSI (14)',
            value: rsi,
            action: this.getRsiAction(rsi)
        });

        // MACD (12, 26, 9)
        const macdValues = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        const macd = macdValues[macdValues.length - 1];
        // MACD Action: MACD > Signal = Buy, MACD < Signal = Sell
        let macdAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (macd && macd.MACD !== undefined && macd.signal !== undefined) {
            if (macd.MACD > macd.signal) macdAction = 'Buy';
            else if (macd.MACD < macd.signal) macdAction = 'Sell';
        }
        oscillators.push({
            name: 'MACD (12, 26)',
            value: macd && macd.MACD !== undefined ? macd.MACD : 0, // specific display logic might prefer histogram
            action: macdAction
        });

        // Stochastic (14, 3, 3) - Common in TV
        const stochValues = Stochastic.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: 14,
            signalPeriod: 3
        });
        const stoch = stochValues[stochValues.length - 1];
        let stochAction: 'Buy' | 'Sell' | 'Neutral' = 'Neutral';
        if (stoch) {
             if (stoch.k < 20 && stoch.d < 20 && stoch.k > stoch.d) stochAction = 'Buy';
             else if (stoch.k > 80 && stoch.d > 80 && stoch.k < stoch.d) stochAction = 'Sell';
        }
        oscillators.push({
            name: 'Stoch %K (14, 3, 3)',
            value: stoch ? stoch.k : 0,
            action: stochAction
        });


        // --- Moving Averages ---
        const movingAverages: IndicatorResult[] = [];
        const periods = [20, 50, 200];

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

        // --- Pivots (Classic) ---
        // Pivots are calculated on the PREVIOUS complete candle (High, Low, Close).
        // If klines contains the current (incomplete) candle at the end, we use index - 2.
        // If klines contains only closed candles, we use index - 1.
        // Let's assume the standard behavior: we want the Pivot for the CURRENT session, based on the PREVIOUS session.
        // So we need the previous candle's H/L/C.
        const prevHigh = highs[highs.length - 2];
        const prevLow = lows[lows.length - 2];
        const prevClose = closes[closes.length - 2];

        const p = (prevHigh + prevLow + prevClose) / 3;
        const r1 = 2 * p - prevLow;
        const s1 = 2 * p - prevHigh;
        const r2 = p + (prevHigh - prevLow);
        const s2 = p - (prevHigh - prevLow);
        const r3 = prevHigh + 2 * (p - prevLow);
        const s3 = prevLow - 2 * (prevHigh - p);

        const pivots = {
            classic: { p, r1, r2, r3, s1, s2, s3 }
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
            summary: { buy: 0, sell: 0, neutral: 0, action: 'Neutral' }
        };
    }
};
