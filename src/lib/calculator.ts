import { Decimal } from 'decimal.js';
import { CONSTANTS } from './constants';
import type { TradeValues, BaseMetrics, IndividualTpResult, TotalMetrics, JournalEntry } from '../stores/types';
import type { Kline } from '../services/apiService';

export const calculator = {
    calculateBaseMetrics(values: TradeValues, tradeType: string): BaseMetrics | null {
        const riskAmount = values.accountSize.times(values.riskPercentage.div(100));
        const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
        if (riskPerUnit.isZero()) return null;

        const positionSize = riskAmount.div(riskPerUnit);
        const orderVolume = positionSize.times(values.entryPrice);
        const requiredMargin = values.leverage.gt(0) ? orderVolume.div(values.leverage) : orderVolume;
        const entryFee = orderVolume.times(values.fees.div(100));
        const slExitFee = positionSize.times(values.stopLossPrice).times(values.fees.div(100));
        const netLoss = riskAmount.plus(entryFee).plus(slExitFee);
        
        const feeFactor = values.fees.div(100);
        const breakEvenPrice = tradeType === CONSTANTS.TRADE_TYPE_LONG
            ? values.entryPrice.times(feeFactor.plus(1)).div(new Decimal(1).minus(feeFactor))
            : values.entryPrice.times(new Decimal(1).minus(feeFactor)).div(feeFactor.plus(1));

        const liquidationPrice = values.leverage.gt(0) ? (tradeType === CONSTANTS.TRADE_TYPE_LONG
            ? values.entryPrice.times(new Decimal(1).minus(new Decimal(1).div(values.leverage)))
            : values.entryPrice.times(new Decimal(1).plus(new Decimal(1).div(values.leverage)))) : new Decimal(0);
        
        return { positionSize, requiredMargin, netLoss, breakEvenPrice, liquidationPrice, entryFee, riskAmount };
    },

    calculateATR(klines: Kline[], period: number = 14): Decimal {
        // We need at least `period + 1` klines to calculate `period` true ranges.
        if (klines.length < period + 1) {
            return new Decimal(0); // Not enough data to calculate ATR.
        }

        const trueRanges: Decimal[] = [];
        // Loop starts at 1 because each True Range calculation needs the previous kline (at i-1).
        // We calculate TR for the last `period` candles available.
        const relevantKlines = klines.slice(-(period + 1));

        for (let i = 1; i < relevantKlines.length; i++) {
            const kline = relevantKlines[i];
            const prevKline = relevantKlines[i - 1];

            const highLow = kline.high.minus(kline.low);
            const highPrevClose = kline.high.minus(prevKline.close).abs();
            const lowPrevClose = kline.low.minus(prevKline.close).abs();

            const trueRange = Decimal.max(highLow, highPrevClose, lowPrevClose);
            trueRanges.push(trueRange);
        }

        if (trueRanges.length === 0) {
            return new Decimal(0);
        }

        // The ATR is the average of the true ranges.
        const sumOfTrueRanges = trueRanges.reduce((sum, val) => sum.plus(val), new Decimal(0));
        return sumOfTrueRanges.div(trueRanges.length);
    },

    calculateIndividualTp(tpPrice: Decimal, currentTpPercent: Decimal, baseMetrics: BaseMetrics, values: TradeValues, index: number): IndividualTpResult {
        const { positionSize, requiredMargin, riskAmount } = baseMetrics;
        const gainPerUnit = tpPrice.minus(values.entryPrice).abs();
        const positionPart = positionSize.times(currentTpPercent.div(100));
        const grossProfitPart = gainPerUnit.times(positionPart);
        const exitFee = positionPart.times(tpPrice).times(values.fees.div(100));
        const entryFeePart = positionPart.times(values.entryPrice).times(values.fees.div(100));
        const netProfit = grossProfitPart.minus(entryFeePart).minus(exitFee);
        const riskForPart = riskAmount.times(currentTpPercent.div(100)); // Annahme: targets[0] ist der aktuelle TP
        const riskRewardRatio = riskForPart.gt(0) ? netProfit.div(riskForPart) : new Decimal(0);
        const priceChangePercent = values.entryPrice.gt(0) ? tpPrice.minus(values.entryPrice).div(values.entryPrice).times(100) : new Decimal(0);
        const returnOnCapital = requiredMargin.gt(0) && currentTpPercent.gt(0) ? netProfit.div(requiredMargin.times(currentTpPercent.div(100))).times(100) : new Decimal(0);
        return { netProfit, riskRewardRatio, priceChangePercent, returnOnCapital, partialVolume: positionPart, exitFee, index: index, percentSold: currentTpPercent };
    },
    calculateTotalMetrics(targets: Array<{ price: Decimal; percent: Decimal; }>, baseMetrics: BaseMetrics, values: TradeValues, tradeType: string): TotalMetrics {
        const { positionSize, entryFee, riskAmount } = baseMetrics;
        let totalNetProfit = new Decimal(0);
        let weightedRRSum = new Decimal(0);
        let totalFees = new Decimal(0);

        targets.forEach((tp, index) => {
            if (tp.price.gt(0) && tp.percent.gt(0)) {
                const { netProfit, riskRewardRatio } = this.calculateIndividualTp(tp.price, tp.percent, baseMetrics, values, index);
                totalNetProfit = totalNetProfit.plus(netProfit);
                const entryFeePart = positionSize.times(tp.percent.div(100)).times(values.entryPrice).times(values.fees.div(100));
                const exitFeePart = positionSize.times(tp.percent.div(100)).times(tp.price).times(values.fees.div(100));
                totalFees = totalFees.plus(entryFeePart).plus(exitFeePart);
                weightedRRSum = weightedRRSum.plus(riskRewardRatio.times(tp.percent.div(100)));
            }
        });
        
        const validTpPrices = targets.filter(t => t.price.gt(0)).map(t => t.price);
        let maxPotentialProfit = new Decimal(0);
        if (validTpPrices.length > 0) {
            const bestTpPrice = tradeType === CONSTANTS.TRADE_TYPE_LONG ? Decimal.max(...validTpPrices) : Decimal.min(...validTpPrices);
            const gainPerUnitFull = bestTpPrice.minus(values.entryPrice).abs();
            const grossProfitFull = gainPerUnitFull.times(positionSize);
            const exitFeeFull = positionSize.times(bestTpPrice).times(values.fees.div(100));
            maxPotentialProfit = grossProfitFull.minus(entryFee).minus(exitFeeFull);
        }

        const totalRR = values.totalPercentSold.gt(0) ? weightedRRSum.div(values.totalPercentSold.div(100)) : new Decimal(0);
        return { totalNetProfit, totalRR, totalFees, maxPotentialProfit, riskAmount };
    },
    calculatePerformanceStats(journalData: JournalEntry[]) {
        const closedTrades = journalData.filter(t => t.status === 'Won' || t.status === 'Lost');
        if (closedTrades.length === 0) return null;

        const sortedClosedTrades = [...closedTrades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const wonTrades = closedTrades.filter(t => t.status === 'Won');
        const lostTrades = closedTrades.filter(t => t.status === 'Lost');
        const totalTrades = closedTrades.length;
        const winRate = totalTrades > 0 ? (wonTrades.length / totalTrades) * 100 : 0;
        
        const totalProfit = wonTrades.reduce((sum, t) => sum.plus(new Decimal(t.totalNetProfit || 0)), new Decimal(0));
        const totalLoss = lostTrades.reduce((sum, t) => sum.plus(new Decimal(t.riskAmount || 0)), new Decimal(0));
        const profitFactor = totalLoss.gt(0) ? totalProfit.dividedBy(totalLoss) : totalProfit.gt(0) ? new Decimal(Infinity) : new Decimal(0);
        
        const avgRR = totalTrades > 0 ? closedTrades.reduce((sum, t) => sum.plus(new Decimal(t.totalRR || 0)), new Decimal(0)).dividedBy(totalTrades) : new Decimal(0);
        const avgWin = wonTrades.length > 0 ? totalProfit.dividedBy(wonTrades.length) : new Decimal(0);
        const avgLossOnly = lostTrades.length > 0 ? totalLoss.dividedBy(lostTrades.length) : new Decimal(0);
        const winLossRatio = avgLossOnly.gt(0) ? avgWin.dividedBy(avgLossOnly) : new Decimal(0);

        const largestProfit = wonTrades.length > 0 ? Decimal.max(0, ...wonTrades.map(t => new Decimal(t.totalNetProfit || 0))) : new Decimal(0);
        const largestLoss = lostTrades.length > 0 ? Decimal.max(0, ...lostTrades.map(t => new Decimal(t.riskAmount || 0))) : new Decimal(0);

        let totalRMultiples = new Decimal(0);
        let tradesWithRisk = 0;
        closedTrades.forEach(trade => {
            if (trade.riskAmount && new Decimal(trade.riskAmount).gt(0)) {
                const rMultiple = trade.status === 'Won' ? (new Decimal(trade.totalNetProfit || 0)).dividedBy(new Decimal(trade.riskAmount)) : new Decimal(-1);
                totalRMultiples = totalRMultiples.plus(rMultiple);
                tradesWithRisk++;
            }
        });
        const avgRMultiple = tradesWithRisk > 0 ? totalRMultiples.dividedBy(tradesWithRisk) : new Decimal(0);

        let cumulativeProfit = new Decimal(0), peakEquity = new Decimal(0), maxDrawdown = new Decimal(0);
        sortedClosedTrades.forEach(trade => {
            cumulativeProfit = trade.status === 'Won' ? cumulativeProfit.plus(new Decimal(trade.totalNetProfit || 0)) : cumulativeProfit.minus(new Decimal(trade.riskAmount || 0));
            if (cumulativeProfit.gt(peakEquity)) peakEquity = cumulativeProfit;
            const drawdown = peakEquity.minus(cumulativeProfit);
            if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
        });

        const recoveryFactor = maxDrawdown.gt(0) ? cumulativeProfit.dividedBy(maxDrawdown) : new Decimal(0);
        const lossRate = totalTrades > 0 ? (lostTrades.length / totalTrades) * 100 : 0;
        const expectancy = (new Decimal(winRate/100).times(avgWin)).minus(new Decimal(lossRate/100).times(avgLossOnly));

        let totalProfitLong = new Decimal(0), totalLossLong = new Decimal(0), totalProfitShort = new Decimal(0), totalLossShort = new Decimal(0);
        closedTrades.forEach(trade => {
            if (trade.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
                if (trade.status === 'Won') totalProfitLong = totalProfitLong.plus(new Decimal(trade.totalNetProfit || 0));
                else totalLossLong = totalLossLong.plus(new Decimal(trade.riskAmount || 0));
            } else {
                if (trade.status === 'Won') totalProfitShort = totalProfitShort.plus(new Decimal(trade.totalNetProfit || 0));
                else totalLossShort = totalLossShort.plus(new Decimal(trade.riskAmount || 0));
            }
        });

        let longestWinningStreak = 0, currentWinningStreak = 0, longestLosingStreak = 0, currentLosingStreak = 0, currentStreakText = 'N/A';
        sortedClosedTrades.forEach(trade => {
            if (trade.status === 'Won') {
                currentWinningStreak++;
                currentLosingStreak = 0;
                if (currentWinningStreak > longestWinningStreak) longestWinningStreak = currentWinningStreak;
            } else {
                currentLosingStreak++;
                currentWinningStreak = 0;
                if (currentLosingStreak > longestLosingStreak) longestLosingStreak = currentLosingStreak;
            }
        });
        if (sortedClosedTrades.length > 0) {
            const lastIsWin = sortedClosedTrades[sortedClosedTrades.length - 1].status === 'Won';
            let streak = 0;
            for (let i = sortedClosedTrades.length - 1; i >= 0; i--) {
                if ((lastIsWin && sortedClosedTrades[i].status === 'Won') || (!lastIsWin && sortedClosedTrades[i].status === 'Lost')) streak++;
                else break;
            }
            currentStreakText = `${lastIsWin ? 'W' : 'L'}${streak}`;
        }

        return { totalTrades, winRate, profitFactor, expectancy, avgRMultiple, avgRR, avgWin, avgLossOnly, winLossRatio, largestProfit, largestLoss, maxDrawdown, recoveryFactor, currentStreakText, longestWinningStreak, longestLosingStreak, totalProfitLong, totalLossLong, totalProfitShort, totalLossShort };
    },
    calculateSymbolPerformance(journalData: JournalEntry[]) {
        const closedTrades = journalData.filter(t => t.status === 'Won' || t.status === 'Lost');
        const symbolPerformance: { [key: string]: { totalTrades: number; wonTrades: number; totalProfitLoss: Decimal; } } = {};
        closedTrades.forEach(trade => {
            if (!trade.symbol) return;
            if (!symbolPerformance[trade.symbol]) {
                symbolPerformance[trade.symbol] = { totalTrades: 0, wonTrades: 0, totalProfitLoss: new Decimal(0) };
            }
            symbolPerformance[trade.symbol].totalTrades++;
            if (trade.status === 'Won') {
                symbolPerformance[trade.symbol].wonTrades++;
                symbolPerformance[trade.symbol].totalProfitLoss = symbolPerformance[trade.symbol].totalProfitLoss.plus(new Decimal(trade.totalNetProfit || 0));
            } else {
                symbolPerformance[trade.symbol].totalProfitLoss = symbolPerformance[trade.symbol].totalProfitLoss.minus(new Decimal(trade.riskAmount || 0));
            }
        });
        return symbolPerformance;
    },

    calculateJournalStats(journalData: JournalEntry[]) {
        const closedTrades = journalData.filter(t => t.status === 'Won' || t.status === 'Lost');

        let wonTrades = 0;
        let lostTrades = 0;
        let totalNetProfit = new Decimal(0);
        let totalWinPnl = new Decimal(0);
        let totalLossPnl = new Decimal(0);

        const getPnL = (t: JournalEntry) => {
             // For API trades (not manual), trust the totalNetProfit
             if (t.isManual === false) return new Decimal(t.totalNetProfit || 0);

             // For Manual trades
             if (t.status === 'Won') return new Decimal(t.totalNetProfit || 0);
             if (t.status === 'Lost') return new Decimal(t.riskAmount || 0).negated();
             return new Decimal(0);
        };

        closedTrades.forEach(t => {
            if (t.status === 'Won') wonTrades++;
            if (t.status === 'Lost') lostTrades++;

            const pnl = getPnL(t);
            totalNetProfit = totalNetProfit.plus(pnl);

            if (pnl.gt(0)) totalWinPnl = totalWinPnl.plus(pnl);
            if (pnl.lt(0)) totalLossPnl = totalLossPnl.plus(pnl.abs());
        });

        const totalTrades = wonTrades + lostTrades;
        const winRate = totalTrades > 0 ? (wonTrades / totalTrades) * 100 : 0;
        const profitFactor = totalLossPnl.gt(0) ? totalWinPnl.div(totalLossPnl) : (totalWinPnl.gt(0) ? new Decimal(Infinity) : new Decimal(0));
        const avgTrade = totalTrades > 0 ? totalNetProfit.div(totalTrades) : new Decimal(0);

        return {
            totalNetProfit,
            winRate: new Decimal(winRate),
            wonTrades,
            lostTrades,
            profitFactor,
            avgTrade
        };
    }
};