
import { describe, it, expect } from 'vitest';
import { JSIndicators } from '../../src/utils/indicators';

describe('Incremental Indicators', () => {

  it('updateEma should match full calculation', () => {
    const data = [10, 12, 11, 13, 15, 14];
    const period = 3;

    // Full Calc
    const fullEma = JSIndicators.ema(data, period);
    const lastFull = fullEma[fullEma.length - 1];

    // Incremental Calc
    // We need to start from a valid state.
    // EMA[t] = EMA[t-1] + K * (P[t] - EMA[t-1])
    // Let's take the second to last EMA value from full calc as "prev"
    const prevEma = fullEma[fullEma.length - 2];
    const newVal = data[data.length - 1];

    const incremental = JSIndicators.updateEma(prevEma, newVal, period);

    expect(incremental).toBeCloseTo(lastFull, 10);
  });

  it('updateSma should match full calculation', () => {
    const data = [10, 20, 30, 40, 50];
    const period = 3;

    // Full
    const fullSma = JSIndicators.sma(data, period);
    const lastFull = fullSma[fullSma.length - 1];

    // Incremental
    // SMA[t] = SMA[t-1] + (New - Old) / N
    const prevSma = fullSma[fullSma.length - 2]; // SMA of [20, 30, 40] = 30
    const newVal = 50;
    const oldVal = 20; // The value dropping out (data[1])

    const incremental = JSIndicators.updateSma(prevSma, newVal, oldVal, period);

    expect(incremental).toBe(lastFull); // Should be exact for simple integers
    expect(incremental).toBe((30 + 40 + 50) / 3);
  });

  it('updateSmma should match full calculation', () => {
      const data = [10, 12, 11, 13, 15, 14, 16];
      const period = 3;

      const fullSmma = JSIndicators.smma(data, period);
      const lastFull = fullSmma[fullSmma.length - 1];

      const prevSmma = fullSmma[fullSmma.length - 2];
      const newVal = 16;

      const incremental = JSIndicators.updateSmma(prevSmma, newVal, period);

      expect(incremental).toBeCloseTo(lastFull, 10);
  });

  it('updateRsi should match full calculation', () => {
    const data = [100, 102, 101, 103, 102, 105, 106, 104, 103, 105]; // 10 points
    const period = 4; // Short period to ensure we have values

    // Full Calc
    const fullRsi = JSIndicators.rsi(data, period);
    const lastFull = fullRsi[fullRsi.length - 1];

    // We need internal state (avgGain, avgLoss) to test incremental RSI properly.
    // Since JSIndicators.rsi doesn't expose avgGain/Loss, we have to calculate "prev" state manually or mimic it.

    // Let's reconstruct the state at T-1
    // Data up to T-1: [100 ... 103]
    const prevData = data.slice(0, data.length - 1);

    // We can't easily extract avgGain/Loss from `rsi()` output.
    // We have to trust that updateRsi implements the Wilder smoothing correctly.
    // Let's manually calculate the expected state.

    // Initial Average (Simple Average of first Period gains/losses)
    // Gains/Losses:
    // 100->102 (+2, 0)
    // 102->101 (0, 1)
    // 101->103 (+2, 0)
    // 103->102 (0, 1)
    // AvgGain = 1, AvgLoss = 0.5. RSI = 100 - 100/(1+2) = 66.66

    // Next: 102->105 (+3, 0)
    // AvgGain = (1 * 3 + 3) / 4 = 1.5
    // AvgLoss = (0.5 * 3 + 0) / 4 = 0.375

    // Next: 105->106 (+1, 0)
    // AvgGain = (1.5*3 + 1)/4 = 1.375
    // AvgLoss = (0.375*3 + 0)/4 = 0.28125

    // Next: 106->104 (0, 2)
    // AvgGain = (1.375*3 + 0)/4 = 1.03125
    // AvgLoss = (0.28125*3 + 2)/4 = 0.7109375

    // Next: 104->103 (0, 1) -> This is the "Prev" state we want to feed in
    // AvgGain = (1.03125*3 + 0)/4 = 0.7734375
    // AvgLoss = (0.7109375*3 + 1)/4 = 0.783203125

    const prevAvgGain = 0.7734375;
    const prevAvgLoss = 0.783203125;
    const prevPrice = 103;

    // Now update with 105
    const currentPrice = 105;
    const result = JSIndicators.updateRsi(prevAvgGain, prevAvgLoss, currentPrice, prevPrice, period);

    // Manual Expectation for last step:
    // Diff +2. Gain 2, Loss 0.
    // NewAvgGain = (0.7734375 * 3 + 2) / 4 = 1.080078125
    // NewAvgLoss = (0.783203125 * 3 + 0) / 4 = 0.58740234375
    // RSI = 100 - 100 / (1 + 1.080078125 / 0.58740234375)

    expect(result.avgGain).toBeCloseTo(1.080078125, 6);
    expect(result.avgLoss).toBeCloseTo(0.58740234375, 6);

    const rsiVal = 100 - 100 / (1 + result.avgGain / result.avgLoss);

    // Compare against Full Calc (which uses same logic)
    expect(rsiVal).toBeCloseTo(lastFull, 6);
    expect(result.rsi).toBeCloseTo(lastFull, 6);
  });
});
