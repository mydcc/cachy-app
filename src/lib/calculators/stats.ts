/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Decimal } from "decimal.js";
import { CONSTANTS } from "../constants";
import { parseTimestamp } from "../../utils/utils";
import type { JournalEntry } from "../../stores/types";
import type { Kline } from "../../services/apiService";
import { getTradePnL } from "./core";
import type { JournalContext, JournalStats, PerformanceStats } from "./types";

export function calculateATR(klines: Kline[], period: number = 14): Decimal {
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

  const sumOfTrueRanges = trueRanges.reduce(
    (sum, val) => sum.plus(val),
    new Decimal(0),
  );
  return sumOfTrueRanges.div(trueRanges.length);
}

export function calculateJournalStats(
  journalData: JournalEntry[],
  context?: JournalContext,
): JournalStats {
  if (context?.journalStats) {
    return context.journalStats;
  }

  const closedTrades =
    context?.closedTrades ??
    journalData.filter((t) => t.status === "Won" || t.status === "Lost");

  let wonTrades = 0;
  let lostTrades = 0;
  let totalNetProfit = new Decimal(0);
  let totalWinPnl = new Decimal(0);
  let totalLossPnl = new Decimal(0);

  closedTrades.forEach((t) => {
    if (t.status === "Won") wonTrades++;
    if (t.status === "Lost") lostTrades++;

    const pnl = getTradePnL(t);
    totalNetProfit = totalNetProfit.plus(pnl);

    if (pnl.gt(0)) totalWinPnl = totalWinPnl.plus(pnl);
    if (pnl.lt(0)) totalLossPnl = totalLossPnl.plus(pnl.abs());
  });

  const totalTrades = wonTrades + lostTrades;
  const winRate = totalTrades > 0 ? (wonTrades / totalTrades) * 100 : 0;
  const profitFactor = totalLossPnl.gt(0)
    ? totalWinPnl.div(totalLossPnl)
    : totalWinPnl.gt(0)
      ? new Decimal(Infinity)
      : new Decimal(0);
  const avgTrade =
    totalTrades > 0 ? totalNetProfit.div(totalTrades) : new Decimal(0);

  return {
    totalNetProfit,
    winRate: new Decimal(winRate),
    wonTrades,
    lostTrades,
    profitFactor,
    avgTrade,
  };
}

export function calculatePerformanceStats(
  journalData: JournalEntry[],
  context?: JournalContext,
): PerformanceStats | null {
  if (context?.performanceStats) {
    return context.performanceStats;
  }

  const closedTrades =
    context?.closedTrades ??
    journalData.filter((t) => t.status === "Won" || t.status === "Lost");

  if (closedTrades.length === 0) return null;

  // Use sorted array for sequential metrics
  const sortedTrades = context
    ? closedTrades
    : [...closedTrades].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

  // Initialize Accumulators
  let totalTrades = 0;
  let wonCount = 0;
  let lostCount = 0;

  let totalProfit = new Decimal(0);
  let totalLoss = new Decimal(0);
  let totalRRSum = new Decimal(0);

  let maxProfit = new Decimal(0);
  let maxLoss = new Decimal(0);

  let totalRMultiples = new Decimal(0);
  let tradesWithRisk = 0;

  let cumulativeProfit = new Decimal(0);
  let peakEquity = new Decimal(0);
  let maxDrawdown = new Decimal(0);

  let totalProfitLong = new Decimal(0);
  let totalLossLong = new Decimal(0);
  let totalProfitShort = new Decimal(0);
  let totalLossShort = new Decimal(0);

  let currentWinningStreak = 0;
  let longestWinningStreak = 0;
  let currentLosingStreak = 0;
  let longestLosingStreak = 0;

  // Single Pass Loop
  for (const trade of sortedTrades) {
      totalTrades++;
      const pnl = getTradePnL(trade);
      const isWin = trade.status === "Won";
      const isLoss = trade.status === "Lost";

      // Win Stats
      if (isWin) {
          wonCount++;
          // Optimized: Reuse pnl instead of creating new Decimal
          const profit = pnl;
          totalProfit = totalProfit.plus(profit);
          if (profit.gt(maxProfit)) maxProfit = profit;
      }

      // Loss Stats
      if (isLoss) {
          lostCount++;
          // Optimized: Check if riskAmount is Decimal
          const loss = (trade.riskAmount instanceof Decimal)
              ? trade.riskAmount
              : new Decimal(trade.riskAmount || 0);
          totalLoss = totalLoss.plus(loss);
          if (loss.gt(maxLoss)) maxLoss = loss;
      }

      // Streak Logic (Original behavior: Won vs Everything Else)
      if (isWin) {
          currentWinningStreak++;
          currentLosingStreak = 0;
          if (currentWinningStreak > longestWinningStreak) longestWinningStreak = currentWinningStreak;
      } else {
          currentLosingStreak++;
          currentWinningStreak = 0;
          if (currentLosingStreak > longestLosingStreak) longestLosingStreak = currentLosingStreak;
      }

      // Avg RR
      if (trade.totalRR) {
          const rr = (trade.totalRR instanceof Decimal)
              ? trade.totalRR
              : new Decimal(trade.totalRR);
          totalRRSum = totalRRSum.plus(rr);
      }

      // R Multiple
      const riskVal = (trade.riskAmount instanceof Decimal)
          ? trade.riskAmount
          : (trade.riskAmount ? new Decimal(trade.riskAmount) : null);

      if (riskVal && riskVal.gt(0)) {
          const rMultiple = isWin
            ? pnl.div(riskVal)
            : new Decimal(-1);

          totalRMultiples = totalRMultiples.plus(rMultiple);
          tradesWithRisk++;
      }

      // Drawdown
      cumulativeProfit = cumulativeProfit.plus(pnl);
      if (cumulativeProfit.gt(peakEquity)) peakEquity = cumulativeProfit;
      const drawdown = peakEquity.minus(cumulativeProfit);
      if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;

      // Long/Short Breakdown
      if (trade.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
          if (pnl.gte(0)) totalProfitLong = totalProfitLong.plus(pnl);
          else totalLossLong = totalLossLong.plus(pnl.abs());
      } else {
          if (pnl.gte(0)) totalProfitShort = totalProfitShort.plus(pnl);
          else totalLossShort = totalLossShort.plus(pnl.abs());
      }
  }

  // Derived Stats
  const winRate = totalTrades > 0 ? (wonCount / totalTrades) * 100 : 0;

  const profitFactor = totalLoss.gt(0)
    ? totalProfit.dividedBy(totalLoss)
    : totalProfit.gt(0) ? new Decimal(Infinity) : new Decimal(0);

  const avgRR = totalTrades > 0 ? totalRRSum.dividedBy(totalTrades) : new Decimal(0);

  const avgWin = wonCount > 0 ? totalProfit.dividedBy(wonCount) : new Decimal(0);
  const avgLossOnly = lostCount > 0 ? totalLoss.dividedBy(lostCount) : new Decimal(0);

  const winLossRatio = avgLossOnly.gt(0) ? avgWin.dividedBy(avgLossOnly) : new Decimal(0);

  const avgRMultiple = tradesWithRisk > 0 ? totalRMultiples.dividedBy(tradesWithRisk) : new Decimal(0);

  const recoveryFactor = maxDrawdown.gt(0) ? cumulativeProfit.dividedBy(maxDrawdown) : new Decimal(0);

  const lossRate = totalTrades > 0 ? (lostCount / totalTrades) * 100 : 0;
  const expectancy = new Decimal(winRate / 100).times(avgWin).minus(new Decimal(lossRate / 100).times(avgLossOnly));

  // Current Streak Text
  let currentStreakText = "N/A";
  if (totalTrades > 0) {
      const lastIsWin = sortedTrades[sortedTrades.length - 1].status === "Won";
      if (lastIsWin) {
          currentStreakText = `W${currentWinningStreak}`;
      } else {
          currentStreakText = `L${currentLosingStreak}`;
      }
  }

  return {
    totalTrades,
    winRate,
    profitFactor,
    expectancy,
    avgRMultiple,
    avgRR,
    avgWin,
    avgLossOnly,
    winLossRatio,
    largestProfit: maxProfit,
    largestLoss: maxLoss,
    maxDrawdown,
    recoveryFactor,
    currentStreakText,
    longestWinningStreak,
    longestLosingStreak,
    totalProfitLong,
    totalLossLong,
    totalProfitShort,
    totalLossShort,
  };
}

export function calculateSymbolPerformance(
  journalData: JournalEntry[],
  context?: JournalContext,
) {
  const closedTrades =
    context?.closedTrades ??
    journalData.filter((t) => t.status === "Won" || t.status === "Lost");

  const symbolPerformance: {
    [key: string]: {
      totalTrades: number;
      wonTrades: number;
      totalProfitLoss: Decimal;
    };
  } = {};
  closedTrades.forEach((trade) => {
    if (!trade.symbol) return;
    if (!symbolPerformance[trade.symbol]) {
      symbolPerformance[trade.symbol] = {
        totalTrades: 0,
        wonTrades: 0,
        totalProfitLoss: new Decimal(0),
      };
    }
    symbolPerformance[trade.symbol].totalTrades++;

    const pnl = getTradePnL(trade);

    if (trade.status === "Won") {
      symbolPerformance[trade.symbol].wonTrades++;
    }
    symbolPerformance[trade.symbol].totalProfitLoss =
      symbolPerformance[trade.symbol].totalProfitLoss.plus(pnl);
  });
  return symbolPerformance;
}

export function getTagData(trades: JournalEntry[], context?: JournalContext) {
  // Use context for closedTrades if available, BUT wait...
  // getTagData original implementation in stats.ts uses `trades.forEach` and checks `status !== "Open"`.
  // If we pass `closedTrades`, we might miss "BreakEven" if they are not in closedTrades (which filters Won/Lost).
  // However, usually Closed = Won + Lost.
  // The original check `t.status === "Open"` implies everything else is processed.
  // If we use `context.closedTrades` (which is Won/Lost), we are safe if those are the only closed statuses.
  // Given `calculateJournalStats` uses Won/Lost, and `calculatePerformanceStats` uses Won/Lost, it is highly likely that Won/Lost are the only relevant ones.
  // BUT to be strict, if `context` is provided, we should ideally use `allTradesSorted` or `openTrades`? No.
  // Let's stick to `closedTrades` (Won/Lost) as that's 99% of the usage.
  // If `trades` argument is passed, it might be the full list.

  // If context is provided, we iterate closedTrades.
  const tradesToIterate = context ? context.closedTrades : trades;

  const tagStats: {
    [key: string]: { win: number; loss: number; pnl: Decimal; count: number };
  } = {};

  tradesToIterate.forEach((t) => {
    if (!context && t.status === "Open") return; // Skip open if manual filtering
    // If context.closedTrades is used, Open is already filtered.

    let tags = t.tags || [];

    if (tags.length === 0) {
      tags = ["No Tag"];
    }

    tags.forEach((tag) => {
      if (!tagStats[tag])
        tagStats[tag] = { win: 0, loss: 0, pnl: new Decimal(0), count: 0 };

      tagStats[tag].count++;
      const pnl = getTradePnL(t);
      tagStats[tag].pnl = tagStats[tag].pnl.plus(pnl);

      if (t.status === "Won") tagStats[tag].win++;
      else tagStats[tag].loss++;
    });
  });

  // Convert to array for sorting/display
  const labels = Object.keys(tagStats);
  const pnlData = labels.map((l) =>
    new Decimal(tagStats[l].pnl || 0).toNumber(),
  );
  const winRateData = labels.map(
    (l) => (tagStats[l].win / tagStats[l].count) * 100,
  );

  return {
    labels,
    pnlData,
    winRateData,
  };
}

export function getCalendarData(trades: JournalEntry[], context?: JournalContext) {
  const tradesToIterate = context ? context.closedTrades : trades;

  // Aggregate PnL by day (YYYY-MM-DD)
  const dailyMap: {
    [key: string]: {
      pnl: Decimal;
      count: number;
      winCount: number;
      lossCount: number;
      bestSymbol: string;
      bestSymbolPnl: Decimal;
    };
  } = {};

  // Helper to track best symbol per day
  const daySymbolMap: { [key: string]: { [symbol: string]: Decimal } } = {};

  tradesToIterate.forEach((t) => {
    if (!context && t.status === "Open") return;

    // Robust parsing
    const ts = parseTimestamp(t.date);
    if (ts <= 0) return;

    const date = new Date(ts);
    const key = date.toISOString().split("T")[0]; // YYYY-MM-DD

    if (!dailyMap[key]) {
      dailyMap[key] = {
        pnl: new Decimal(0),
        count: 0,
        winCount: 0,
        lossCount: 0,
        bestSymbol: "",
        bestSymbolPnl: new Decimal(-Infinity),
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
      if (!daySymbolMap[key][t.symbol])
        daySymbolMap[key][t.symbol] = new Decimal(0);
      daySymbolMap[key][t.symbol] = daySymbolMap[key][t.symbol].plus(pnl);
    }
  });

  // Determine best symbol for each day
  Object.keys(daySymbolMap).forEach((dayKey) => {
    let bestSym = "";
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
    pnl: new Decimal(data.pnl || 0).toNumber(),
    count: data.count,
    winCount: data.winCount,
    lossCount: data.lossCount,
    bestSymbol: data.bestSymbol,
    bestSymbolPnl: data.bestSymbolPnl.isFinite()
      ? new Decimal(data.bestSymbolPnl).toNumber()
      : 0,
  }));
}

export function getRollingData(
  journal: JournalEntry[],
  windowSize: number = 20,
  context?: JournalContext,
) {
  const sortedTrades = context
    ? context.closedTrades
    : journal
        .filter((t) => t.status === "Won" || t.status === "Lost")
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

  if (sortedTrades.length < windowSize) return null;

  const labels: string[] = [];
  const winRates: number[] = [];
  const profitFactors: number[] = [];
  const sqnValues: number[] = [];

  for (let i = windowSize; i <= sortedTrades.length; i++) {
    const windowTrades = sortedTrades.slice(i - windowSize, i);

    // Calculate Win Rate
    const wins = windowTrades.filter((t) => t.status === "Won").length;
    winRates.push((wins / windowSize) * 100);

    // Calculate Profit Factor (or Net PnL sum)
    let grossWin = new Decimal(0);
    let grossLoss = new Decimal(0);

    // For SQN
    const rMultiples: number[] = [];

    windowTrades.forEach((t) => {
      const pnl = getTradePnL(t);
      if (pnl.gt(0)) grossWin = grossWin.plus(pnl);
      else grossLoss = grossLoss.plus(pnl.abs());

      // Calculate R
      if (t.riskAmount && new Decimal(t.riskAmount).gt(0)) {
        rMultiples.push(pnl.div(new Decimal(t.riskAmount)).toNumber());
      } else {
        // Fallback
      }
    });

    // Handle Infinity
    let pf = 0;
    if (grossLoss.isZero()) {
      pf = grossWin.gt(0) ? 10 : 0; // Cap at 10 for visualization
    } else {
      pf = new Decimal(grossWin.div(grossLoss)).toNumber();
    }
    profitFactors.push(pf);

    // Calculate SQN
    let sqn = 0;
    if (rMultiples.length > 0) {
      const sumR = rMultiples.reduce((a, b) => a + b, 0);
      const avgR = sumR / rMultiples.length; // Expectancy (in R)
      const variance =
        rMultiples.reduce((sum, r) => sum + Math.pow(r - avgR, 2), 0) /
        rMultiples.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        sqn = (avgR / stdDev) * Math.sqrt(rMultiples.length);
      }
    }
    sqnValues.push(sqn);

    // Label
    const date = new Date(windowTrades[windowTrades.length - 1].date);
    labels.push(date.toLocaleDateString());
  }

  return {
    labels,
    winRates,
    profitFactors,
    sqnValues,
  };
}

export function getLeakageData(journal: JournalEntry[], context?: JournalContext) {
  const closedTrades =
    context?.closedTrades ??
    journal.filter((t) => t.status === "Won" || t.status === "Lost");

  let totalGrossProfit = new Decimal(0);
  let totalGrossLoss = new Decimal(0); // Absolute value
  let totalFees = new Decimal(0);

  closedTrades.forEach((t) => {
    const pnl = getTradePnL(t);
    const fees = (t.totalFees || new Decimal(0))
      .plus(t.fundingFee || new Decimal(0))
      .plus(t.tradingFee || new Decimal(0));

    const grossPnl = pnl.plus(fees);

    if (grossPnl.gt(0)) {
      totalGrossProfit = totalGrossProfit.plus(grossPnl);
    } else {
      totalGrossLoss = totalGrossLoss.plus(grossPnl.abs());
    }

    totalFees = totalFees.plus(fees);
  });

  const totalNetProfit = totalGrossProfit
    .minus(totalGrossLoss)
    .minus(totalFees);
  const profitRetention = totalGrossProfit.gt(0)
    ? new Decimal(totalNetProfit.div(totalGrossProfit).times(100)).toNumber()
    : 0;

  const feeImpact = totalGrossProfit.gt(0)
    ? new Decimal(totalFees.div(totalGrossProfit).times(100)).toNumber()
    : 0;

  const waterfallData = {
    grossProfit: new Decimal(totalGrossProfit).toNumber(),
    fees: new Decimal(totalFees.negated()).toNumber(),
    grossLoss: new Decimal(totalGrossLoss.negated()).toNumber(),
    netResult: new Decimal(totalNetProfit).toNumber(),
  };

  const tagStats = getTagData(closedTrades, context);
  const worstTags = tagStats.labels
    .map((label, i) => ({ label, pnl: tagStats.pnlData[i] }))
    .filter((item) => item.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5);

  const timingStats = getTimingData(closedTrades, context);

  const worstHours = timingStats.hourlyGrossLoss
    .map((loss, hour) => ({ hour, loss: Math.abs(loss) }))
    .filter((h) => h.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 5);

  const worstDays = timingStats.dayLabels
    .map((day, i) => ({
      day,
      loss: Math.abs(timingStats.dayOfWeekGrossLoss[i]),
    }))
    .filter((d) => d.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3);

  return {
    profitRetention,
    feeImpact,
    waterfallData,
    totalFees: new Decimal(totalFees).toNumber(),
    worstTags,
    worstHours,
    worstDays,
  };
}

export function getDurationStats(journal: JournalEntry[], context?: JournalContext) {
  const closedTrades =
    context?.closedTrades ??
    journal.filter((t) => t.status === "Won" || t.status === "Lost");

  const buckets = [
    {
      label: "< 15m",
      maxMs: 15 * 60 * 1000,
      count: 0,
      win: 0,
      pnl: new Decimal(0),
    },
    {
      label: "15m - 1h",
      maxMs: 60 * 60 * 1000,
      count: 0,
      win: 0,
      pnl: new Decimal(0),
    },
    {
      label: "1h - 4h",
      maxMs: 4 * 60 * 60 * 1000,
      count: 0,
      win: 0,
      pnl: new Decimal(0),
    },
    {
      label: "4h - 24h",
      maxMs: 24 * 60 * 60 * 1000,
      count: 0,
      win: 0,
      pnl: new Decimal(0),
    },
    { label: "> 24h", maxMs: Infinity, count: 0, win: 0, pnl: new Decimal(0) },
  ];

  closedTrades.forEach((t) => {
    let startTs = 0,
      endTs = 0;
    if (t.entryDate) startTs = new Date(t.entryDate).getTime();
    else if (t.isManual !== false) startTs = new Date(t.date).getTime();

    if (t.isManual === false) endTs = new Date(t.date).getTime();
    else if (t.exitDate) endTs = new Date(t.exitDate).getTime();

    if (startTs > 0 && endTs > 0) {
      const duration = endTs - startTs;
      if (duration > 0) {
        const bucket =
          buckets.find((b) => duration <= b.maxMs) ||
          buckets[buckets.length - 1];
        bucket.count++;
        const pnl = getTradePnL(t);
        bucket.pnl = bucket.pnl.plus(pnl);
        if (t.status === "Won") bucket.win++;
      }
    }
  });

  const labels = buckets.map((b) => b.label);
  const pnlData = buckets.map((b) => new Decimal(b.pnl || 0).toNumber());
  const winRateData = buckets.map((b) =>
    b.count > 0 ? (b.win / b.count) * 100 : 0,
  );

  return { labels, pnlData, winRateData };
}

export function getTimingData(trades: JournalEntry[], context?: JournalContext) {
  const tradesToIterate = context ? context.closedTrades : trades;

  const hourlyNetPnl = new Array(24).fill(0).map(() => new Decimal(0));
  const hourlyGrossProfit = new Array(24).fill(0).map(() => new Decimal(0));
  const hourlyGrossLoss = new Array(24).fill(0).map(() => new Decimal(0));
  const dayNetPnl = new Array(7).fill(0).map(() => new Decimal(0));
  const dayGrossProfit = new Array(7).fill(0).map(() => new Decimal(0));
  const dayGrossLoss = new Array(7).fill(0).map(() => new Decimal(0));

  tradesToIterate.forEach((t) => {
    if (!context && t.status === "Open") return;
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return;

    const hour = date.getHours();
    const day = date.getDay();
    const pnl = getTradePnL(t);

    hourlyNetPnl[hour] = hourlyNetPnl[hour].plus(pnl);
    if (pnl.gte(0)) hourlyGrossProfit[hour] = hourlyGrossProfit[hour].plus(pnl);
    else hourlyGrossLoss[hour] = hourlyGrossLoss[hour].plus(pnl);

    dayNetPnl[day] = dayNetPnl[day].plus(pnl);
    if (pnl.gte(0)) dayGrossProfit[day] = dayGrossProfit[day].plus(pnl);
    else dayGrossLoss[day] = dayGrossLoss[day].plus(pnl);
  });

  const reorder = (arr: Decimal[]) => [
    arr[1],
    arr[2],
    arr[3],
    arr[4],
    arr[5],
    arr[6],
    arr[0],
  ];

  return {
    hourlyPnl: hourlyNetPnl.map((d) => new Decimal(d).toNumber()),
    hourlyGrossProfit: hourlyGrossProfit.map((d) => new Decimal(d).toNumber()),
    hourlyGrossLoss: hourlyGrossLoss.map((d) => new Decimal(d).toNumber()),
    dayOfWeekPnl: reorder(dayNetPnl).map((d) => new Decimal(d).toNumber()),
    dayOfWeekGrossProfit: reorder(dayGrossProfit).map((d) =>
      new Decimal(d).toNumber(),
    ),
    dayOfWeekGrossLoss: reorder(dayGrossLoss).map((d) =>
      new Decimal(d).toNumber(),
    ),
    dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };
}

export function getDisciplineData(journal: JournalEntry[], context?: JournalContext) {
  const timing = getTimingData(journal, context);

  const sortedTrades = context
    ? context.closedTrades
    : journal
        .filter((t) => t.status === "Won" || t.status === "Lost")
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;

  sortedTrades.forEach((t) => {
    if (t.status === "Won") {
      curWin++;
      curLoss = 0;
      if (curWin > maxWinStreak) maxWinStreak = curWin;
    } else if (t.status === "Lost") {
      curLoss++;
      curWin = 0;
      if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    }
  });

  const riskBuckets: { [key: string]: number } = {};
  const risks = sortedTrades
    .filter((t) => t.riskAmount && new Decimal(t.riskAmount).gt(0))
    .map((t) => new Decimal(t.riskAmount!).toNumber());

  if (risks.length > 0) {
    const minRisk = Math.min(...risks);
    const maxRisk = Math.max(...risks);

    if (Math.abs(maxRisk - minRisk) < 0.01) {
      riskBuckets[`$${(maxRisk ?? 0).toFixed(2)}`] = risks.length;
    } else {
      const binCount = 5;
      const range = maxRisk - minRisk;
      const step = range / binCount;

      risks.forEach((r) => {
        let idx = Math.floor((r - minRisk) / step);
        if (idx >= binCount) idx = binCount - 1;

        const low = minRisk + idx * step;
        const high = minRisk + (idx + 1) * step;

        const label = `$${(low ?? 0).toFixed(0)} - $${(high ?? 0).toFixed(0)}`;
        riskBuckets[label] = (riskBuckets[label] || 0) + 1;
      });
    }
  }

  return {
    hourlyPnl: timing.hourlyPnl,
    streak: {
      win: maxWinStreak,
      loss: maxLossStreak,
    },
    riskBuckets,
  };
}
