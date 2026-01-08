import { Decimal } from 'decimal.js';
import { CONSTANTS } from './constants';
import { parseTimestamp } from '../utils/utils';
import type { TradeValues, BaseMetrics, IndividualTpResult, TotalMetrics, JournalEntry } from '../stores/types';
import type { Kline } from '../services/apiService';

function getTradePnL(t: JournalEntry): Decimal {
    if (t.isManual === false) {
        return new Decimal(t.totalNetProfit || 0);
    }
    // Manual trades
    if (t.status === 'Won') return new Decimal(t.totalNetProfit || 0);
    if (t.status === 'Lost') return new Decimal(t.riskAmount || 0).negated();
    return new Decimal(0);
}

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
        if (klines.length < period + 1) {
            return new Decimal(0);
        }

        const trueRanges: Decimal[] = [];
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
        const riskForPart = riskAmount.times(currentTpPercent.div(100));
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

    // --- New Data Builders for Charts ---

    getPerformanceData(journal: JournalEntry[]) {
        const closedTrades = journal
            .filter(t => t.status === 'Won' || t.status === 'Lost')
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // 1. Equity Curve
        let cumulative = new Decimal(0);
        const equityCurve = closedTrades.map(t => {
            const pnl = getTradePnL(t);
            cumulative = cumulative.plus(pnl);
            return { x: t.date, y: cumulative.toNumber() };
        });

        // 2. Drawdown Series
        let peak = new Decimal(0);
        let currentDrawdown = new Decimal(0);
        let runningPnl = new Decimal(0);
        const drawdownSeries = closedTrades.map(t => {
             const pnl = getTradePnL(t);
             runningPnl = runningPnl.plus(pnl);
             if (runningPnl.gt(peak)) peak = runningPnl;
             currentDrawdown = runningPnl.minus(peak); // Should be negative or zero
             return { x: t.date, y: currentDrawdown.toNumber() };
        });

        // 3. Monthly Stats
        const monthlyStats: {[key: string]: Decimal} = {};
        closedTrades.forEach(t => {
            const date = new Date(t.date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const pnl = getTradePnL(t);
            monthlyStats[monthKey] = (monthlyStats[monthKey] || new Decimal(0)).plus(pnl);
        });
        const monthlyLabels = Object.keys(monthlyStats).sort();
        const monthlyData = monthlyLabels.map(k => monthlyStats[k].toNumber());

        return { equityCurve, drawdownSeries, monthlyLabels, monthlyData };
    },

    getQualityData(journal: JournalEntry[]) {
        const closedTrades = journal
            .filter(t => t.status === 'Won' || t.status === 'Lost')
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
        const won = closedTrades.filter(t => t.status === 'Won').length;
        const lost = closedTrades.filter(t => t.status === 'Lost').length;

        // 1. Win/Loss Distribution (Old) - Keep for backward compatibility if needed, but we will use sixSegmentData
        const winLossData = [won, lost];

        // 1b. Enhanced 6-Segment Distribution
        let winLong = 0, winShort = 0, lossLong = 0, lossShort = 0, beLong = 0, beShort = 0;

        // Detailed Stats calculation vars
        let totalWin = new Decimal(0);
        let totalLoss = new Decimal(0); // Absolute value
        let countWin = 0;
        let countLoss = 0;

        let countLong = 0;
        let countLongWin = 0;
        let countShort = 0;
        let countShortWin = 0;

        closedTrades.forEach(t => {
            const pnl = getTradePnL(t);
            const isLong = t.tradeType?.toLowerCase() === CONSTANTS.TRADE_TYPE_LONG;

            // Stats Aggregation
            if (isLong) {
                countLong++;
                if (pnl.gt(0)) countLongWin++;
            } else {
                countShort++;
                if (pnl.gt(0)) countShortWin++;
            }

            if (pnl.gt(0)) {
                totalWin = totalWin.plus(pnl);
                countWin++;
            } else if (pnl.lt(0)) {
                totalLoss = totalLoss.plus(pnl.abs());
                countLoss++;
            }

            // Segment Logic
            if (pnl.gt(0)) {
                if (isLong) winLong++; else winShort++;
            } else if (pnl.lt(0)) {
                if (isLong) lossLong++; else lossShort++;
            } else {
                // Break Even (PnL == 0)
                if (isLong) beLong++; else beShort++;
            }
        });

        const sixSegmentData = [winLong, winShort, lossLong, lossShort, beLong, beShort];

        // Detailed Stats
        const avgWin = countWin > 0 ? totalWin.div(countWin) : new Decimal(0);
        const avgLoss = countLoss > 0 ? totalLoss.div(countLoss) : new Decimal(0);
        const profitFactor = totalLoss.gt(0) ? totalWin.div(totalLoss) : (totalWin.gt(0) ? new Decimal(Infinity) : new Decimal(0));

        const winRate = closedTrades.length > 0 ? (countWin / closedTrades.length) : 0;
        const lossRate = closedTrades.length > 0 ? (countLoss / closedTrades.length) : 0;
        const expectancy = avgWin.times(winRate).minus(avgLoss.times(lossRate));

        const winRateLong = countLong > 0 ? (countLongWin / countLong) * 100 : 0;
        const winRateShort = countShort > 0 ? (countShortWin / countShort) * 100 : 0;

        const detailedStats = {
            profitFactor: profitFactor.toNumber(),
            avgWin: avgWin.toNumber(),
            avgLoss: avgLoss.toNumber(),
            expectancy: expectancy.toNumber(),
            winRateLong,
            winRateShort
        };

        // 2. R-Multiple Distribution
        const rMultiples: number[] = [];

        closedTrades.forEach(t => {
            // Only calculate R if riskAmount is present and positive
            if (t.riskAmount && t.riskAmount.gt(0)) {
                const pnl = getTradePnL(t);
                rMultiples.push(pnl.div(t.riskAmount).toNumber());
            }
            // If synced trade with no riskAmount (0), we exclude it from distribution to avoid skewing "0R to 1R" bucket with massive count of 0s.
        });

        // Bucketing R-Multiples
        const buckets: {[key: string]: number} = { '<-1R': 0, '-1R to 0R': 0, '0R to 1R': 0, '1R to 2R': 0, '2R to 3R': 0, '>3R': 0 };
        rMultiples.forEach(r => {
            if (r < -1) buckets['<-1R']++;
            else if (r < 0) buckets['-1R to 0R']++; // Usually losses are -1R
            else if (r < 1) buckets['0R to 1R']++;
            else if (r < 2) buckets['1R to 2R']++;
            else if (r < 3) buckets['2R to 3R']++;
            else buckets['>3R']++;
        });

        // 3. Cumulative R Curve (New Requirement)
        let cumulativeR = new Decimal(0);
        const cumulativeRCurve = closedTrades.map(t => {
            let r = new Decimal(0);
            if (t.riskAmount && t.riskAmount.gt(0)) {
                const pnl = getTradePnL(t);
                r = pnl.div(t.riskAmount);
            } else {
                // For trades without risk, do not add arbitrary 1R/-1R as it distorts data.
                // We add 0R.
                r = new Decimal(0);
            }
            
            cumulativeR = cumulativeR.plus(r);
            return { x: t.date, y: cumulativeR.toNumber() };
        });

        // 4. KPI
        const stats = this.calculateJournalStats(journal);

        return { winLossData, sixSegmentData, detailedStats, rHistogram: buckets, cumulativeRCurve, stats };
    },

    getDirectionData(journal: JournalEntry[]) {
         const closedTrades = journal.filter(t => t.status === 'Won' || t.status === 'Lost');

         // 1. Long vs Short
         let longPnl = new Decimal(0);
         let shortPnl = new Decimal(0);
         closedTrades.forEach(t => {
             const pnl = getTradePnL(t);
             if (t.tradeType === CONSTANTS.TRADE_TYPE_LONG) longPnl = longPnl.plus(pnl);
             else shortPnl = shortPnl.plus(pnl);
         });

         // 2. Symbol Performance (Top 5 / Bottom 5)
         const symbolMap: {[key: string]: Decimal} = {};
         closedTrades.forEach(t => {
             const pnl = getTradePnL(t);
             symbolMap[t.symbol] = (symbolMap[t.symbol] || new Decimal(0)).plus(pnl);
         });

         const sortedSymbols = Object.entries(symbolMap).sort((a, b) => b[1].minus(a[1]).toNumber());
         const topSymbols = sortedSymbols.slice(0, 5);
         const bottomSymbols = sortedSymbols.slice(-5).reverse(); // Worst first

         return {
             longPnl: longPnl.toNumber(),
             shortPnl: shortPnl.toNumber(),
             topSymbols: { labels: topSymbols.map(s => s[0]), data: topSymbols.map(s => s[1].toNumber()) },
             bottomSymbols: { labels: bottomSymbols.map(s => s[0]), data: bottomSymbols.map(s => s[1].toNumber()) }
         };
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
            cumulativeProfit = cumulativeProfit.plus(getTradePnL(trade));
            if (cumulativeProfit.gt(peakEquity)) peakEquity = cumulativeProfit;
            const drawdown = peakEquity.minus(cumulativeProfit);
            if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
        });

        const recoveryFactor = maxDrawdown.gt(0) ? cumulativeProfit.dividedBy(maxDrawdown) : new Decimal(0);
        const lossRate = totalTrades > 0 ? (lostTrades.length / totalTrades) * 100 : 0;
        const expectancy = (new Decimal(winRate/100).times(avgWin)).minus(new Decimal(lossRate/100).times(avgLossOnly));

        let totalProfitLong = new Decimal(0), totalLossLong = new Decimal(0), totalProfitShort = new Decimal(0), totalLossShort = new Decimal(0);
        closedTrades.forEach(trade => {
            const pnl = getTradePnL(trade);
            if (trade.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
                if (pnl.gte(0)) totalProfitLong = totalProfitLong.plus(pnl);
                else totalLossLong = totalLossLong.plus(pnl.abs());
            } else {
                if (pnl.gte(0)) totalProfitShort = totalProfitShort.plus(pnl);
                else totalLossShort = totalLossShort.plus(pnl.abs());
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

    getDisciplineData(journal: JournalEntry[]) {
        const closedTrades = journal.filter(t => t.status === 'Won' || t.status === 'Lost');

        // 1. Time of Day Analysis (Heatmap proxy: Hourly buckets)
        const hourlyPnl = new Array(24).fill(0);
        const hourlyCount = new Array(24).fill(0);

        closedTrades.forEach(t => {
            const hour = new Date(t.date).getHours();
            const pnl = getTradePnL(t);
            hourlyPnl[hour] += pnl.toNumber();
            hourlyCount[hour]++;
        });

        // 2. Risk Consistency (Histogram of Risk %)
        // We use riskPercentage if available, or calculate it riskAmount/accountSize
        const riskBuckets: {[key: string]: number} = { '<1%': 0, '1-2%': 0, '2-3%': 0, '>3%': 0 };
        closedTrades.forEach(t => {
            let riskPct = t.riskPercentage ? t.riskPercentage.toNumber() : 0;
            if (riskPct === 0 && t.accountSize && t.accountSize.gt(0) && t.riskAmount) {
                riskPct = t.riskAmount.div(t.accountSize).times(100).toNumber();
            }

            if (riskPct < 1) riskBuckets['<1%']++;
            else if (riskPct < 2) riskBuckets['1-2%']++;
            else if (riskPct < 3) riskBuckets['2-3%']++;
            else riskBuckets['>3%']++;
        });

        // 3. Streak Analysis (calculated in performancestats, just returning formatted)
        const perfStats = this.calculatePerformanceStats(journal);

        return { hourlyPnl, riskBuckets, streak: perfStats ? { win: perfStats.longestWinningStreak, loss: perfStats.longestLosingStreak } : { win:0, loss:0 } };
    },

    getCostData(journal: JournalEntry[]) {
        const closedTrades = journal.filter(t => t.status === 'Won' || t.status === 'Lost');

        // 1. Gross vs Net PnL (Total)
        let totalGross = new Decimal(0);
        let totalNet = new Decimal(0);
        let totalFees = new Decimal(0);

        closedTrades.forEach(t => {
            const net = getTradePnL(t);
            const fees = t.totalFees || new Decimal(0);
            const funding = t.fundingFee || new Decimal(0);
            const trading = t.tradingFee || new Decimal(0);

            const totalFee = fees.plus(funding).plus(trading);

            totalNet = totalNet.plus(net);
            totalFees = totalFees.plus(totalFee);
            totalGross = totalGross.plus(net).plus(totalFee); // Gross = Net + Fees (since Net = Gross - Fees)
        });

        // 2. Cumulative Fees
        let cumFees = new Decimal(0);
        const feeCurve = closedTrades.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(t => {
            const fees = t.totalFees || new Decimal(0);
            const funding = t.fundingFee || new Decimal(0);
            const trading = t.tradingFee || new Decimal(0);
            cumFees = cumFees.plus(fees).plus(funding).plus(trading);
            return { x: t.date, y: cumFees.toNumber() };
        });

        // 3. Fee Structure
        let sumTrading = new Decimal(0);
        let sumFunding = new Decimal(0);
        closedTrades.forEach(t => {
             sumTrading = sumTrading.plus(t.tradingFee || t.fees || 0); // fallback to fees if tradingFee not set
             sumFunding = sumFunding.plus(t.fundingFee || 0);
        });

        return {
            gross: totalGross.toNumber(),
            net: totalNet.toNumber(),
            feeCurve,
            feeStructure: { trading: sumTrading.toNumber(), funding: sumFunding.toNumber() }
        };
    },

    // --- Deep Dive Data Builders ---

    getTimingData: (trades: JournalEntry[]) => {
        // Initialize arrays for 24 hours
        const hourlyNetPnl = new Array(24).fill(0).map(() => new Decimal(0));
        const hourlyGrossProfit = new Array(24).fill(0).map(() => new Decimal(0));
        const hourlyGrossLoss = new Array(24).fill(0).map(() => new Decimal(0));
        
        // Initialize arrays for 7 days (0=Sun, 6=Sat)
        const dayNetPnl = new Array(7).fill(0).map(() => new Decimal(0));
        const dayGrossProfit = new Array(7).fill(0).map(() => new Decimal(0));
        const dayGrossLoss = new Array(7).fill(0).map(() => new Decimal(0));

        trades.forEach(t => {
            if (t.status === 'Open') return;
            const date = new Date(t.date); 
            if (isNaN(date.getTime())) return;

            const hour = date.getHours();
            const day = date.getDay();
            const pnl = getTradePnL(t);
            
            // Hourly
            hourlyNetPnl[hour] = hourlyNetPnl[hour].plus(pnl);
            if (pnl.gte(0)) hourlyGrossProfit[hour] = hourlyGrossProfit[hour].plus(pnl);
            else hourlyGrossLoss[hour] = hourlyGrossLoss[hour].plus(pnl);

            // Daily
            dayNetPnl[day] = dayNetPnl[day].plus(pnl);
            if (pnl.gte(0)) dayGrossProfit[day] = dayGrossProfit[day].plus(pnl);
            else dayGrossLoss[day] = dayGrossLoss[day].plus(pnl);
        });

        // Reorder Day of Week to start Monday (Index 1) -> Sunday (Index 0)
        // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
        // Target: Mon, Tue, Wed, Thu, Fri, Sat, Sun
        const reorder = (arr: Decimal[]) => [
            arr[1], arr[2], arr[3], arr[4], arr[5], arr[6], arr[0]
        ];

        return {
            hourlyPnl: hourlyNetPnl.map(d => d.toNumber()),
            hourlyGrossProfit: hourlyGrossProfit.map(d => d.toNumber()),
            hourlyGrossLoss: hourlyGrossLoss.map(d => d.toNumber()), // Keep negative numbers negative
            dayOfWeekPnl: reorder(dayNetPnl).map(d => d.toNumber()),
            dayOfWeekGrossProfit: reorder(dayGrossProfit).map(d => d.toNumber()),
            dayOfWeekGrossLoss: reorder(dayGrossLoss).map(d => d.toNumber()),
            dayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        };
    },
    
    getDurationData: (trades: JournalEntry[]) => {
        // Scatter: x = Duration (minutes), y = PnL ($)
        const scatterData = trades
            .filter(t => t.status !== 'Open')
            .map(t => {
                let startTs = 0;
                let endTs = 0;

                // 1. Determine Start Time
                // Synced trades: entryDate is Entry
                // Manual trades: date is usually Entry (or entryDate if available)
                if (t.entryDate) {
                    startTs = new Date(t.entryDate).getTime();
                } else if (t.isManual !== false) {
                    // Fallback for Manual trades without entryDate
                    startTs = new Date(t.date).getTime();
                }

                // 2. Determine End Time
                // Synced trades: date is Exit (Close Time)
                // Manual trades: exitDate is Exit
                if (t.isManual === false) {
                    endTs = new Date(t.date).getTime();
                } else {
                    if (t.exitDate) endTs = new Date(t.exitDate).getTime();
                }

                // Validate and Calculate Duration
                if (startTs > 0 && endTs > 0 && !isNaN(startTs) && !isNaN(endTs)) {
                     const diff = endTs - startTs;
                     if (diff > 0) {
                         const durationMinutes = diff / 1000 / 60;
                         const pnl = getTradePnL(t);
                         return {
                             x: durationMinutes,
                             y: pnl.toNumber(),
                             r: 6,
                             l: `${t.symbol}: ${Math.round(durationMinutes)}m -> $${pnl.toFixed(2)}`
                         };
                     }
                }
                return null;
            })
            .filter(d => d !== null);

        return { scatterData };
    },

    getAssetData: (trades: JournalEntry[]) => {
        const symbolStats: {[key: string]: { win: number, loss: number, pnl: Decimal, count: number }} = {};

        trades.forEach(t => {
            if (t.status === 'Open') return;
            const sym = t.symbol;
            if (!symbolStats[sym]) symbolStats[sym] = { win: 0, loss: 0, pnl: new Decimal(0), count: 0 };
            
            symbolStats[sym].count++;
            
            const pnl = getTradePnL(t);
            symbolStats[sym].pnl = symbolStats[sym].pnl.plus(pnl);
            
            if (t.status === 'Won') symbolStats[sym].win++;
            else symbolStats[sym].loss++;
        });

        // Bubble Data: x=WinRate, y=PnL, r=Count (scaled)
        const bubbleData = Object.keys(symbolStats).map(sym => {
            const s = symbolStats[sym];
            const winRate = s.count > 0 ? (s.win / s.count) * 100 : 0;
            return {
                x: winRate,
                y: s.pnl.toNumber(),
                r: Math.min(Math.max(s.count * 2, 5), 30), // Scale radius
                l: `${sym}: ${s.count} Trades, ${winRate.toFixed(1)}% Win, $${s.pnl.toFixed(2)}` // Label for tooltip
            };
        });

        return {
            bubbleData
        };
    },

    getRiskData: (trades: JournalEntry[]) => {
        // Scatter: x = Risk Amount ($), y = Realized PnL ($)
        // Helps visualize if high risk = high reward (or high loss)
        const scatterData = trades
            .filter(t => t.status !== 'Open' && t.riskAmount && t.riskAmount.gt(0))
            .map(t => {
                const pnl = getTradePnL(t);
                return {
                    x: t.riskAmount.toNumber(),
                    y: pnl.toNumber(),
                    r: 6, // Fixed radius for scatter plot visibility
                    l: `${t.symbol} (${t.status}): Risk $${t.riskAmount.toFixed(2)} -> PnL $${pnl.toFixed(2)}`
                };
            });

        return {
            scatterData
        };
    },

    getMarketData: (trades: JournalEntry[]) => {
        let longWin = 0, longTotal = 0;
        let shortWin = 0, shortTotal = 0;
        const leverageBuckets: {[key: string]: number} = { '1-5x': 0, '6-10x': 0, '11-20x': 0, '21-50x': 0, '50x+': 0 };

        trades.forEach(t => {
            if (t.status === 'Open') return;
            
            // Direction Analysis
            if (t.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
                longTotal++;
                if (t.status === 'Won') longWin++;
            } else {
                shortTotal++;
                if (t.status === 'Won') shortWin++;
            }

            // Leverage Analysis
            const lev = t.leverage ? t.leverage.toNumber() : 1;
            if (lev <= 5) leverageBuckets['1-5x']++;
            else if (lev <= 10) leverageBuckets['6-10x']++;
            else if (lev <= 20) leverageBuckets['11-20x']++;
            else if (lev <= 50) leverageBuckets['21-50x']++;
            else leverageBuckets['50x+']++;
        });

        const longWinRate = longTotal > 0 ? (longWin / longTotal) * 100 : 0;
        const shortWinRate = shortTotal > 0 ? (shortWin / shortTotal) * 100 : 0;

        return {
            longShortWinRate: [longWinRate, shortWinRate],
            leverageDist: Object.values(leverageBuckets),
            leverageLabels: Object.keys(leverageBuckets)
        };
    },

    getPsychologyData: (trades: JournalEntry[]) => {
        // Streak Analysis
        const sorted = [...trades].filter(t => t.status === 'Won' || t.status === 'Lost').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        const winStreaks: number[] = [];
        const lossStreaks: number[] = [];

        sorted.forEach(t => {
            if (t.status === 'Won') {
                if (currentLossStreak > 0) {
                    lossStreaks.push(currentLossStreak);
                    currentLossStreak = 0;
                }
                currentWinStreak++;
            } else if (t.status === 'Lost') {
                if (currentWinStreak > 0) {
                    winStreaks.push(currentWinStreak);
                    currentWinStreak = 0;
                }
                currentLossStreak++;
            }
        });
        if (currentWinStreak > 0) winStreaks.push(currentWinStreak);
        if (currentLossStreak > 0) lossStreaks.push(currentLossStreak);

        // Histogram of streaks
        const winStreakCounts: {[key: number]: number} = {};
        const lossStreakCounts: {[key: number]: number} = {};

        winStreaks.forEach(s => winStreakCounts[s] = (winStreakCounts[s] || 0) + 1);
        lossStreaks.forEach(s => lossStreakCounts[s] = (lossStreakCounts[s] || 0) + 1);

        // Prepare labels (1 to max streak)
        const maxStreak = Math.max(...winStreaks, ...lossStreaks, 0);
        const streakLabels = Array.from({length: maxStreak}, (_, i) => (i + 1).toString());
        
        const winStreakData = streakLabels.map(l => winStreakCounts[parseInt(l)] || 0);
        const lossStreakData = streakLabels.map(l => lossStreakCounts[parseInt(l)] || 0);

        return {
            winStreakData,
            lossStreakData,
            streakLabels
        };
    },

    calculateJournalStats(journalData: JournalEntry[]) {
        const closedTrades = journalData.filter(t => t.status === 'Won' || t.status === 'Lost');

        let wonTrades = 0;
        let lostTrades = 0;
        let totalNetProfit = new Decimal(0);
        let totalWinPnl = new Decimal(0);
        let totalLossPnl = new Decimal(0);

        closedTrades.forEach(t => {
            if (t.status === 'Won') wonTrades++;
            if (t.status === 'Lost') lostTrades++;

            const pnl = getTradePnL(t);
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

            const pnl = getTradePnL(trade);

            if (trade.status === 'Won') {
                symbolPerformance[trade.symbol].wonTrades++;
            }
            symbolPerformance[trade.symbol].totalProfitLoss = symbolPerformance[trade.symbol].totalProfitLoss.plus(pnl);
        });
        return symbolPerformance;
    },

    getTagData: (trades: JournalEntry[]) => {
        const tagStats: {[key: string]: { win: number, loss: number, pnl: Decimal, count: number }} = {};

        trades.forEach(t => {
            if (t.status === 'Open') return;
            const tags = t.tags || [];

            // If no tags, maybe bucket as 'No Tag'?
            // if (tags.length === 0) tags.push('Untagged');

            tags.forEach(tag => {
                if (!tagStats[tag]) tagStats[tag] = { win: 0, loss: 0, pnl: new Decimal(0), count: 0 };

                tagStats[tag].count++;
                const pnl = getTradePnL(t);
                tagStats[tag].pnl = tagStats[tag].pnl.plus(pnl);

                if (t.status === 'Won') tagStats[tag].win++;
                else tagStats[tag].loss++;
            });
        });

        // Convert to array for sorting/display
        const labels = Object.keys(tagStats);
        const pnlData = labels.map(l => tagStats[l].pnl.toNumber());
        const winRateData = labels.map(l => (tagStats[l].win / tagStats[l].count) * 100);

        return {
            labels,
            pnlData,
            winRateData
        };
    },

    getCalendarData: (trades: JournalEntry[]) => {
        // Aggregate PnL by day (YYYY-MM-DD)
        const dailyMap: {[key: string]: {
            pnl: Decimal,
            count: number,
            winCount: number,
            lossCount: number,
            bestSymbol: string,
            bestSymbolPnl: Decimal
        }} = {};

        // Helper to track best symbol per day
        const daySymbolMap: {[key: string]: {[symbol: string]: Decimal}} = {};

        trades.forEach(t => {
            if (t.status === 'Open') return;

            // Robust parsing
            const ts = parseTimestamp(t.date);
            if (ts <= 0) return;

            const date = new Date(ts);
            const key = date.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!dailyMap[key]) {
                dailyMap[key] = {
                    pnl: new Decimal(0),
                    count: 0,
                    winCount: 0,
                    lossCount: 0,
                    bestSymbol: '',
                    bestSymbolPnl: new Decimal(-Infinity)
                };
                daySymbolMap[key] = {};
            }

            const pnl = getTradePnL(t);
            dailyMap[key].pnl = dailyMap[key].pnl.plus(pnl);
            dailyMap[key].count++;

            if (pnl.gt(0)) dailyMap[key].winCount++;
            else if (pnl.lt(0)) dailyMap[key].lossCount++;

            // Track symbol performance for the day
            if (t.symbol) {
                if (!daySymbolMap[key][t.symbol]) daySymbolMap[key][t.symbol] = new Decimal(0);
                daySymbolMap[key][t.symbol] = daySymbolMap[key][t.symbol].plus(pnl);
            }
        });

        // Determine best symbol for each day
        Object.keys(daySymbolMap).forEach(dayKey => {
            let bestSym = '';
            let maxPnl = new Decimal(-Infinity);

            Object.entries(daySymbolMap[dayKey]).forEach(([sym, pnl]) => {
                if (pnl.gt(maxPnl)) {
                    maxPnl = pnl;
                    bestSym = sym;
                }
            });

            if (bestSym) {
                dailyMap[dayKey].bestSymbol = bestSym;
                dailyMap[dayKey].bestSymbolPnl = maxPnl;
            }
        });

        return Object.entries(dailyMap).map(([date, data]) => ({
            date,
            pnl: data.pnl.toNumber(),
            count: data.count,
            winCount: data.winCount,
            lossCount: data.lossCount,
            bestSymbol: data.bestSymbol,
            bestSymbolPnl: data.bestSymbolPnl.isFinite() ? data.bestSymbolPnl.toNumber() : 0
        }));
    }
};
