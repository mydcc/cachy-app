import { describe, it, expect } from 'vitest';
import { JSIndicators } from '../../utils/indicators';

describe('Financial Compliance Audit', () => {

    // RSI: Wilder's Smoothing
    // Logic: 1st Avg = SMA. Subsequent = (Prev * (n-1) + Curr) / n
    it('RSI: adheres to Wilder\'s Smoothing logic', () => {
        // Input: 14 periods of Gain 1, then 1 period of Gain 1.
        // RSI should be 100.
        // Input: 14 periods of Gain 1, then Loss 1.
        // First RS: AvgGain = 1, AvgLoss = 0 -> RSI 100.
        // Next: Gain 0, Loss 1.
        // New AvgGain = (1 * 13 + 0) / 14 = 13/14
        // New AvgLoss = (0 * 13 + 1) / 14 = 1/14
        // RS = 13
        // RSI = 100 - 100/(1+13) = 100 - 100/14 = 100 - 7.14 = 92.857...

        const input = new Float64Array(16).fill(0);
        // Prices: 0, 1, 2, ... 14 (14 gains of 1).
        for(let i=0; i<=14; i++) input[i] = i;
        // Price 15: 13 (Loss of 1)
        input[15] = 13;

        const rsi = JSIndicators.rsi(input, 14);

        // Index 14 is the first calculated RSI (based on changes 1..14)
        // 14 gains of 1. AvgGain=1. AvgLoss=0. RSI=100.
        expect(rsi[14]).toBe(100);

        // Index 15:
        // AvgGain = 13/14 = 0.9285714286
        // AvgLoss = 1/14 = 0.0714285714
        // RS = 13
        // RSI = 100 - (100/14) = 92.857142857
        expect(rsi[15]).toBeCloseTo(92.857142857, 6);
    });

    // MACD: Standard 12/26/9
    it('MACD: uses correct EMA initialization and Signal Line lag', () => {
        // Standard MACD uses EMA.
        // EMA starts with SMA at index `period-1`.
        // So Slow EMA (26) is valid from index 25.
        // MACD = Fast(26) - Slow(26). Valid from index 25.
        // Signal (9) is EMA of MACD.
        // Signal needs 9 values of MACD.
        // MACD available from 25.
        // Signal available from 25 + 9 - 1 = 33.

        const input = new Float64Array(50).fill(10); // Flat line
        const res = JSIndicators.macd(input, 12, 26, 9);

        // Flat line -> EMAs are equal -> MACD is 0.
        expect(res.macd[49]).toBe(0);
        expect(res.signal[49]).toBe(0);

        // Check availability
        expect(isNaN(res.macd[24])).toBe(true);
        expect(res.macd[25]).toBe(0); // First valid MACD

        expect(isNaN(res.signal[32])).toBe(true);
        expect(res.signal[33]).toBe(0); // First valid Signal
    });

    // ATR: True Range Logic
    it('ATR: handles gaps correctly (True Range)', () => {
        // High, Low, Close
        // Day 1: 10, 8, 9. (Range 2).
        // Day 2: 20, 18, 19. (Gap up).
        // H-L = 2.
        // |H - Cp| = |20 - 9| = 11.
        // |L - Cp| = |18 - 9| = 9.
        // TR = 11.

        const h = new Float64Array([10, 20]);
        const l = new Float64Array([8, 18]);
        const c = new Float64Array([9, 19]);

        // Use period 1 to just get TR (ATR(1) is basically smoothed TR, but for length 2, init is TR).
        // JSIndicators.atr uses SMMA.
        // SMMA(1) -> Sum(1)/1 = value.
        // So index 1 should be TR.

        const res = JSIndicators.atr(h, l, c, 1);
        expect(res[1]).toBe(11);
    });
});
