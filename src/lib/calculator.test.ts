import { describe, it, expect } from 'vitest';
import { calculator } from './calculator';
import { Decimal } from 'decimal.js';
import { CONSTANTS } from './constants';

describe('Calculator - Core Functions', () => {

    describe('calculateBaseMetrics', () => {
        it('should calculate metrics for Long trade', () => {
            const values = {
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1), // $10 risk
                entryPrice: new Decimal(100),
                stopLossPrice: new Decimal(90), // $10 diff
                leverage: new Decimal(10),
                fees: new Decimal(0.1),
                symbol: 'TEST',
                useAtrSl: false,
                atrValue: new Decimal(0),
                atrMultiplier: new Decimal(0),
                targets: [],
                totalPercentSold: new Decimal(0)
            };
            // Position Size = Risk / |Entry - SL| = 10 / 10 = 1 unit
            // Order Vol = 1 * 100 = 100
            // Margin = 100 / 10 = 10

            const res = calculator.calculateBaseMetrics(values as any, CONSTANTS.TRADE_TYPE_LONG);
            expect(res).not.toBeNull();
            expect(res!.positionSize.toNumber()).toBe(1);
            expect(res!.requiredMargin.toNumber()).toBe(10);
            expect(res!.riskAmount.toNumber()).toBe(10);
        });

        it('should calculate metrics for Short trade', () => {
            const values = {
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1),
                entryPrice: new Decimal(100),
                stopLossPrice: new Decimal(110),
                leverage: new Decimal(5),
                fees: new Decimal(0.06),
                symbol: 'TEST',
                useAtrSl: false,
                atrValue: new Decimal(0),
                atrMultiplier: new Decimal(0),
                targets: [],
                totalPercentSold: new Decimal(0)
            };

            const res = calculator.calculateBaseMetrics(values as any, CONSTANTS.TRADE_TYPE_SHORT);
            expect(res).not.toBeNull();
            expect(res!.positionSize.toNumber()).toBe(1);
            expect(res!.requiredMargin.toNumber()).toBe(20); // 100 / 5
        });

        it('should return null if SL equals Entry', () => {
             const values = {
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1),
                entryPrice: new Decimal(100),
                stopLossPrice: new Decimal(100),
                leverage: new Decimal(10),
                fees: new Decimal(0.1),
                symbol: 'TEST',
                useAtrSl: false,
                atrValue: new Decimal(0),
                atrMultiplier: new Decimal(0),
                targets: [],
                totalPercentSold: new Decimal(0)
            };
            const res = calculator.calculateBaseMetrics(values as any, CONSTANTS.TRADE_TYPE_LONG);
            expect(res).toBeNull();
        });
    });

    describe('calculateIndividualTp', () => {
        it('should calculate TP metrics correctly', () => {
            const baseMetrics = {
                positionSize: new Decimal(1),
                requiredMargin: new Decimal(10),
                netLoss: new Decimal(10),
                breakEvenPrice: new Decimal(100),
                liquidationPrice: new Decimal(0),
                entryFee: new Decimal(0.1),
                riskAmount: new Decimal(10)
            };
            const values = {
                accountSize: new Decimal(1000),
                riskPercentage: new Decimal(1),
                entryPrice: new Decimal(100),
                leverage: new Decimal(10),
                fees: new Decimal(0.1),
                symbol: 'TEST',
                useAtrSl: false,
                atrValue: new Decimal(0),
                atrMultiplier: new Decimal(0),
                stopLossPrice: new Decimal(90),
                targets: [],
                totalPercentSold: new Decimal(0)
            };

            // TP at 120 (Gain 20), 50% sell
            const res = calculator.calculateIndividualTp(new Decimal(120), new Decimal(50), baseMetrics, values as any, 0);

            // Part Size = 0.5
            // Gross Profit = 20 * 0.5 = 10
            // Fees ... ignored for simple check, but verifying structure
            expect(res.netProfit.toNumber()).toBeLessThan(10); // Minus fees
            expect(res.netProfit.toNumber()).toBeGreaterThan(9);
            expect(res.riskRewardRatio.toNumber()).toBeCloseTo(2.0, 0); // Approx 2R (1.98)
        });
    });

    describe('calculateTotalMetrics', () => {
         it('should sum up TPs', () => {
             // Mock data
             const targets = [{ price: new Decimal(110), percent: new Decimal(100) }];
             const baseMetrics = { positionSize: new Decimal(1), entryFee: new Decimal(0), riskAmount: new Decimal(10), requiredMargin: new Decimal(10), netLoss: new Decimal(10), breakEvenPrice: new Decimal(100), liquidationPrice: new Decimal(0) };
             const values = { accountSize: new Decimal(1000), riskPercentage: new Decimal(1), entryPrice: new Decimal(100), leverage: new Decimal(10), fees: new Decimal(0), symbol: 'T', useAtrSl: false, atrValue: new Decimal(0), atrMultiplier: new Decimal(0), stopLossPrice: new Decimal(90), targets: [], totalPercentSold: new Decimal(100) };

             const res = calculator.calculateTotalMetrics(targets as any, baseMetrics, values as any, CONSTANTS.TRADE_TYPE_LONG);
             expect(res.totalNetProfit.toNumber()).toBe(10);
         });
    });

    describe('calculateATR', () => {
        it('should calculate average true range', () => {
            // Mock Klines: H, L, C
            // 1: 105, 95, 100. TR = 10
            // 2: 110, 100, 105. TR = Max(10, |110-100|=10, |100-100|=0) = 10
            const klines = [
                { high: new Decimal(105), low: new Decimal(95), close: new Decimal(100) },
                { high: new Decimal(110), low: new Decimal(100), close: new Decimal(105) }
            ];
            // Period 1. Need 2 klines.
            const atr = calculator.calculateATR(klines as any, 1);
            expect(atr.toNumber()).toBe(10);
        });

        it('should return 0 if not enough data', () => {
             const klines = [{ high: new Decimal(100), low: new Decimal(90), close: new Decimal(95) }];
             const atr = calculator.calculateATR(klines as any, 14);
             expect(atr.toNumber()).toBe(0);
        });
    });

    // Test for Table Stats (calculatePerformanceStats)
    describe('calculatePerformanceStats', () => {
        it('should calculate performance stats correctly', () => {
            const journalData = [
                { id: 1, date: '2024-01-01', status: 'Won', totalNetProfit: new Decimal(50), riskAmount: new Decimal(10), totalRR: new Decimal(5), tradeType: CONSTANTS.TRADE_TYPE_LONG, symbol: 'BTCUSDT' },
                { id: 2, date: '2024-01-02', status: 'Lost', totalNetProfit: new Decimal(-10), riskAmount: new Decimal(10), totalRR: new Decimal(-1), tradeType: CONSTANTS.TRADE_TYPE_SHORT, symbol: 'BTCUSDT' },
                { id: 3, date: '2024-01-03', status: 'Won', totalNetProfit: new Decimal(30), riskAmount: new Decimal(10), totalRR: new Decimal(3), tradeType: CONSTANTS.TRADE_TYPE_LONG, symbol: 'BTCUSDT' },
            ];

            // Cast to JournalEntry for test
            const stats = calculator.calculatePerformanceStats(journalData as any);

            expect(stats).not.toBeNull();
            expect(stats?.totalTrades).toBe(3);
            expect(stats?.winRate.toFixed(2)).toBe('66.67');
            expect(stats?.profitFactor.toFixed(2)).toBe('8.00'); // (50+30)/10 = 8
            expect(stats?.maxDrawdown.toFixed(2)).toBe('10.00'); // -10 (from +50 to +40)
        });
    });

    // Test for Symbol Performance (calculateSymbolPerformance)
    describe('calculateSymbolPerformance', () => {
        it('should calculate symbol performance correctly', () => {
            const journalData = [
                { id: 1, symbol: 'BTCUSDT', status: 'Won', totalNetProfit: new Decimal(50), riskAmount: new Decimal(10), tradeType: 'long', date: '2024-01-01' },
                { id: 2, symbol: 'ETHUSDT', status: 'Lost', totalNetProfit: new Decimal(-10), riskAmount: new Decimal(10), tradeType: 'short', date: '2024-01-02' },
                { id: 3, symbol: 'BTCUSDT', status: 'Won', totalNetProfit: new Decimal(30), riskAmount: new Decimal(10), tradeType: 'long', date: '2024-01-03' },
            ];

            const stats = calculator.calculateSymbolPerformance(journalData as any);

            expect(stats['BTCUSDT']).toBeDefined();
            expect(stats['BTCUSDT'].totalTrades).toBe(2);
            expect(stats['BTCUSDT'].wonTrades).toBe(2);
            expect(stats['BTCUSDT'].totalProfitLoss.toNumber()).toBe(80);

            expect(stats['ETHUSDT']).toBeDefined();
            expect(stats['ETHUSDT'].totalTrades).toBe(1);
            expect(stats['ETHUSDT'].wonTrades).toBe(0);
            expect(stats['ETHUSDT'].totalProfitLoss.toNumber()).toBe(-10); // Lost 1 risk amount (10)
        });
    });

});
