import { bench, describe, vi } from 'vitest';

// Mock the Svelte store module to avoid runtime errors
vi.mock('../../stores/indicator.svelte', () => ({
    indicatorState: {
        toJSON: () => ({}) // Dummy
    }
}));

// Mock $app/environment
vi.mock('$app/environment', () => ({
    browser: false
}));

// Mock logger
vi.mock('../../services/logger', () => ({
    logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
    }
}));

// Mock toastService
vi.mock('../../services/toastService.svelte', () => ({
    toastService: {
        warning: () => {},
        error: () => {},
        success: () => {},
        info: () => {}
    }
}));

import { technicalsService } from '../../services/technicalsService';
import type { IndicatorSettings } from '../../types/indicators';

const mockSettings: any = {
    historyLimit: 500,
    precision: 2,
    autoOptimize: true,
    preferredEngine: 'auto',
    performanceMode: 'balanced',
    rsi: { length: 14, source: 'close', showSignal: true, signalType: 'sma', signalLength: 14, overbought: 70, oversold: 30, defaultTimeframe: '1h' },
    stochRsi: { length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: 'close' },
    macd: { fastLength: 12, slowLength: 26, signalLength: 9, source: 'close', oscillatorMaType: 'ema', signalMaType: 'ema' },
    stochastic: { kPeriod: 14, kSmoothing: 3, dPeriod: 3 },
    williamsR: { length: 14 },
    cci: { length: 20, source: 'close', threshold: 100, smoothingType: 'sma', smoothingLength: 5 },
    adx: { adxSmoothing: 14, diLength: 14, threshold: 20 },
    ao: { fastLength: 5, slowLength: 34 },
    momentum: { length: 10, source: 'close' },
    ema: {
        ema1: { length: 9, offset: 0, smoothingType: 'none', smoothingLength: 5 },
        ema2: { length: 21, offset: 0, smoothingType: 'none', smoothingLength: 5 },
        ema3: { length: 50, offset: 0, smoothingType: 'none', smoothingLength: 5 },
        source: 'close'
    },
    sma: { sma1: { length: 20 }, sma2: { length: 50 }, sma3: { length: 200 } },
    wma: { length: 9 },
    vwma: { length: 20 },
    hma: { length: 9 },
    ichimoku: { conversionPeriod: 9, basePeriod: 26, spanBPeriod: 52, displacement: 26 },
    pivots: { type: 'classic', viewMode: 'integrated' },
    atr: { length: 14 },
    bb: { length: 20, stdDev: 2 },
    choppiness: { length: 14 },
    superTrend: { factor: 3, period: 10 },
    atrTrailingStop: { period: 14, multiplier: 3 },
    obv: { smoothingLength: 5 },
    mfi: { length: 14 },
    vwap: { length: 14, anchor: 'session' },
    parabolicSar: { start: 0.02, increment: 0.02, max: 0.2 },
    volumeMa: { length: 20, maType: 'sma' },
    volumeProfile: { rows: 24 },
    bollingerBands: { length: 20, stdDev: 2, source: 'close' }
};

const klines = Array(100).fill(0).map((_, i) => ({
    time: 1000 + i * 60000,
    open: 100 + Math.random(),
    high: 105 + Math.random(),
    low: 95 + Math.random(),
    close: 102 + Math.random(),
    volume: 1000 + Math.random()
}));

// Pre-warm
await technicalsService.calculateTechnicals(klines, mockSettings);

const optimizedSettings = structuredClone(mockSettings);
optimizedSettings._cachedJson = JSON.stringify(mockSettings);

describe('Technicals Cache Key Generation', () => {
  bench('calculateTechnicals (Fresh Settings Object)', async () => {
    const freshSettings = structuredClone(mockSettings);
    await technicalsService.calculateTechnicals(klines, freshSettings);
  });

  bench('calculateTechnicals (Optimized Settings Object)', async () => {
    const settings = structuredClone(optimizedSettings);
    await technicalsService.calculateTechnicals(klines, settings);
  });

  bench('structuredClone Only', async () => {
    structuredClone(mockSettings);
  });
});
