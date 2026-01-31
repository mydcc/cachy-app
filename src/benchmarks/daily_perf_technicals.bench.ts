
import { bench, describe } from 'vitest';
import { calculateAllIndicators } from '../utils/technicalsCalculator';
import { technicalsService } from '../services/technicalsService';
import { Decimal } from 'decimal.js';

// Generate dummy klines
const generateKlines = (count: number) => {
    const klines = [];
    let price = new Decimal(100);
    for (let i = 0; i < count; i++) {
        price = price.plus(Math.random() - 0.5);
        klines.push({
            time: i * 60000,
            open: price,
            high: price.plus(1),
            low: price.minus(1),
            close: price.plus(0.5),
            volume: new Decimal(1000)
        });
    }
    return klines;
};

const klines = generateKlines(1000);
const settings = {
    rsi: { length: 14, source: "close", showSignal: true, signalType: "sma", signalLength: 14, overbought: 70, oversold: 30, defaultTimeframe: "1d" },
    stochRsi: { length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" },
    macd: { fastLength: 12, slowLength: 26, signalLength: 9, source: "close", oscillatorMaType: "ema", signalMaType: "ema" },
    stochastic: { kPeriod: 14, kSmoothing: 3, dPeriod: 3 },
    williamsR: { length: 14 },
    cci: { length: 20, source: "close", threshold: 100, smoothingType: "sma", smoothingLength: 5 },
    adx: { adxSmoothing: 14, diLength: 14, threshold: 25 },
    ao: { fastLength: 5, slowLength: 34 },
    momentum: { length: 10, source: "close" },
    ema: {
        ema1: { length: 21, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        ema2: { length: 50, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        ema3: { length: 200, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        source: "close",
    },
    // ... add large unused config
    ichimoku: { conversionPeriod: 9, basePeriod: 26, spanBPeriod: 52, displacement: 26 },
    pivots: { type: "classic", viewMode: "integrated" },
    atr: { length: 14 },
    bb: { length: 20, stdDev: 2 },
    choppiness: { length: 14 },
    superTrend: { factor: 3, period: 10 },
    atrTrailingStop: { period: 14, multiplier: 3.5 },
    obv: { smoothingLength: 0 },
    mfi: { length: 14 },
    vwap: { length: 0, anchor: "session" },
    parabolicSar: { start: 0.02, increment: 0.02, max: 0.2 },
    volumeMa: { length: 20, maType: "sma" },
    volumeProfile: { rows: 24 },
} as any;

describe('Technicals Performance', () => {
    bench('Full Calculation (Current)', () => {
        // Simulates what marketAnalyst does currently:
        // Pass { EMA: true, RSI: true } but due to logic, it calculates everything
        calculateAllIndicators(klines, settings, { "EMA": true, "RSI": true });
    });

    bench('Cache Key Generation', () => {
        JSON.stringify(settings);
    });
});
