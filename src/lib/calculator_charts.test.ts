import { describe, it, expect } from 'vitest';
import { calculator } from './calculator';
import { Decimal } from 'decimal.js';
import type { JournalEntry } from '../stores/types';
import { CONSTANTS } from './constants';

// Helper to create a minimal valid JournalEntry
const createTrade = (overrides: Partial<JournalEntry> = {}): JournalEntry => {
    return {
        id: Date.now(),
        date: new Date().toISOString(),
        symbol: 'BTCUSDT',
        tradeType: CONSTANTS.TRADE_TYPE_LONG,
        status: 'Won',
        accountSize: new Decimal(1000),
        riskPercentage: new Decimal(1),
        leverage: new Decimal(10),
        fees: new Decimal(0.1),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49500),
        totalRR: new Decimal(2),
        totalNetProfit: new Decimal(100),
        riskAmount: new Decimal(50),
        totalFees: new Decimal(5),
        maxPotentialProfit: new Decimal(200),
        notes: '',
        targets: [],
        calculatedTpDetails: [],
        isManual: true,
        ...overrides
    };
};

describe('Calculator - Deep Dive & Dashboard Charts', () => {

    describe('getPerformanceData', () => {
        it('should handle empty journal', () => {
            const data = calculator.getPerformanceData([]);
            expect(data.equityCurve).toEqual([]);
            expect(data.drawdownSeries).toEqual([]);
            expect(data.monthlyData).toEqual([]);
        });

        it('should calculate equity curve correctly for manual trades', () => {
            const trades = [
                createTrade({ date: '2023-01-01T10:00:00Z', status: 'Won', totalNetProfit: new Decimal(100) }),
                createTrade({ date: '2023-01-02T10:00:00Z', status: 'Lost', riskAmount: new Decimal(50), totalNetProfit: new Decimal(0) })
            ];
            const data = calculator.getPerformanceData(trades);

            // Trade 1: +100 -> Cum: 100
            // Trade 2: -50 -> Cum: 50
            expect(data.equityCurve).toHaveLength(2);
            expect(data.equityCurve[0].y).toBe(100);
            expect(data.equityCurve[1].y).toBe(50);
        });

        it('should calculate drawdown correctly', () => {
            const trades = [
                createTrade({ date: '2023-01-01', status: 'Won', totalNetProfit: new Decimal(100) }), // Peak 100
                createTrade({ date: '2023-01-02', status: 'Lost', riskAmount: new Decimal(50), totalNetProfit: new Decimal(0) }),    // Peak 100, Curr 50 -> DD -50
                createTrade({ date: '2023-01-03', status: 'Lost', riskAmount: new Decimal(20), totalNetProfit: new Decimal(0) }),    // Peak 100, Curr 30 -> DD -70
                createTrade({ date: '2023-01-04', status: 'Won', totalNetProfit: new Decimal(80) })  // Peak 110, Curr 110 -> DD 0
            ];
            const data = calculator.getPerformanceData(trades);
            expect(data.drawdownSeries.map(d => d.y)).toEqual([0, -50, -70, 0]);
        });
    });

    describe('getTimingData', () => {
        it('should bucket trades into hours correctly (local time)', () => {
            // Test assumes test runner timezone. This can be flaky if not careful.
            // We use getHours() which is local.
            const date = new Date('2023-01-01T14:30:00'); // 14:30 Local
            // We force a specific date object to mock getHours if needed, but easier to just check the index corresponding to getHours()

            const hour = date.getHours();
            const trades = [
                createTrade({ date: date.toISOString(), status: 'Won', totalNetProfit: new Decimal(50) })
            ];

            const data = calculator.getTimingData(trades);
            expect(data.hourlyPnl[hour]).toBe(50);
            expect(data.hourlyPnl[(hour + 1) % 24]).toBe(0);
        });

        it('should handle invalid dates gracefully', () => {
            const trades = [
                createTrade({ date: 'invalid-date', status: 'Won', totalNetProfit: new Decimal(50) })
            ];

            // Should not throw
            const data = calculator.getTimingData(trades);

            // Should simply return zeros as the trade is skipped
            expect(data.hourlyPnl.every(p => p === 0)).toBe(true);
        });
    });

    describe('getRiskData', () => {
        it('should filter out trades with zero/null riskAmount', () => {
            const trades = [
                createTrade({ riskAmount: new Decimal(100), totalNetProfit: new Decimal(200) }),
                createTrade({ riskAmount: new Decimal(0), totalNetProfit: new Decimal(50) }),
                createTrade({ riskAmount: undefined as any, totalNetProfit: new Decimal(50) }) // Simulate runtime missing field
            ];

            const data = calculator.getRiskData(trades);
            expect(data.scatterData).toHaveLength(1);
            expect(data.scatterData[0].x).toBe(100);
            expect(data.scatterData[0].y).toBe(200);
        });
    });

    describe('getQualityData', () => {
        it('should handle R-Multiples correctly', () => {
             const trades = [
                createTrade({ status: 'Won', riskAmount: new Decimal(50), totalNetProfit: new Decimal(100) }), // 2R
                createTrade({ status: 'Lost', riskAmount: new Decimal(50), totalNetProfit: new Decimal(0) }) // -1R
            ];
            const data = calculator.getQualityData(trades);
            // 2R -> '2R to 3R' (since <2 is false, and <3 is true)
            expect(data.rHistogram['2R to 3R']).toBe(1);
            expect(data.rHistogram['-1R to 0R']).toBe(1);
        });

        it('should handle division by zero riskAmount gracefully', () => {
             const trades = [
                createTrade({ status: 'Won', riskAmount: new Decimal(0), totalNetProfit: new Decimal(100) })
            ];
            const data = calculator.getQualityData(trades);
            // Logic change: trades with 0 riskAmount are now ignored in the histogram
            // So '0R to 1R' should be 0, total count 0
            expect(data.rHistogram['0R to 1R']).toBe(0);
            expect(Object.values(data.rHistogram).reduce((a, b) => a + b, 0)).toBe(0);
        });
    });

    describe('getPsychologyData', () => {
        it('should calculate streaks correctly', () => {
             // Dates must be ordered
             const trades = [
                createTrade({ date: '2023-01-01', status: 'Won' }),
                createTrade({ date: '2023-01-02', status: 'Won' }),
                createTrade({ date: '2023-01-03', status: 'Lost' }),
                createTrade({ date: '2023-01-04', status: 'Won' }),
                createTrade({ date: '2023-01-05', status: 'Won' }),
                createTrade({ date: '2023-01-06', status: 'Won' })
             ];
             // Win 2, Loss 1, Win 3
             // Win Streaks: 2, 3
             // Loss Streaks: 1

             const data = calculator.getPsychologyData(trades);
             // Streak Labels: 1, 2, 3
             expect(data.streakLabels).toEqual(['1', '2', '3']);
             // Win Streak Data: [0, 1, 1] (One streak of 2, one streak of 3)
             // Wait, logic:
             // winStreakCounts[2] = 1, winStreakCounts[3] = 1
             // array map over labels '1','2','3' -> [0, 1, 1]
             expect(data.winStreakData).toEqual([0, 1, 1]);

             // Loss Streak Data: [1, 0, 0] (One streak of 1)
             expect(data.lossStreakData).toEqual([1, 0, 0]);
        });
    });

    describe('getMarketData', () => {
         it('should bucket leverage correctly', () => {
             const trades = [
                 createTrade({ leverage: new Decimal(5) }),
                 createTrade({ leverage: new Decimal(10) }),
                 createTrade({ leverage: new Decimal(25) })
             ];
             const data = calculator.getMarketData(trades);
             // '1-5x': 1
             // '6-10x': 1
             // '21-50x': 1
             // Indicies: 0, 1, 2, 3, 4
             // 1-5x is index 0
             expect(data.leverageDist[0]).toBe(1);
             expect(data.leverageDist[1]).toBe(1);
             expect(data.leverageDist[3]).toBe(1);
         });
    });
});
