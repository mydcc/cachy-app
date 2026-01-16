import { Decimal } from "decimal.js";
import { CONSTANTS } from "../constants";
import { parseTimestamp } from "../../utils/utils";
import type { JournalEntry } from "../../stores/types";
import type { Kline } from "../../services/apiService";
import { getTradePnL } from "./core";

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
    new Decimal(0)
  );
  return sumOfTrueRanges.div(trueRanges.length);
}

export function calculateJournalStats(journalData: JournalEntry[]) {
  const closedTrades = journalData.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

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

export function calculatePerformanceStats(journalData: JournalEntry[]) {
  const closedTrades = journalData.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );
  if (closedTrades.length === 0) return null;

  const sortedClosedTrades = [...closedTrades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const wonTrades = closedTrades.filter((t) => t.status === "Won");
  const lostTrades = closedTrades.filter((t) => t.status === "Lost");
  const totalTrades = closedTrades.length;
  const winRate = totalTrades > 0 ? (wonTrades.length / totalTrades) * 100 : 0;

  const totalProfit = wonTrades.reduce(
    (sum, t) => sum.plus(new Decimal(t.totalNetProfit || 0)),
    new Decimal(0)
  );
  const totalLoss = lostTrades.reduce(
    (sum, t) => sum.plus(new Decimal(t.riskAmount || 0)),
    new Decimal(0)
  );
  const profitFactor = totalLoss.gt(0)
    ? totalProfit.dividedBy(totalLoss)
    : totalProfit.gt(0)
      ? new Decimal(Infinity)
      : new Decimal(0);

  const avgRR =
    totalTrades > 0
      ? closedTrades
        .reduce(
          (sum, t) => sum.plus(new Decimal(t.totalRR || 0)),
          new Decimal(0)
        )
        .dividedBy(totalTrades)
      : new Decimal(0);
  const avgWin =
    wonTrades.length > 0
      ? totalProfit.dividedBy(wonTrades.length)
      : new Decimal(0);
  const avgLossOnly =
    lostTrades.length > 0
      ? totalLoss.dividedBy(lostTrades.length)
      : new Decimal(0);
  const winLossRatio = avgLossOnly.gt(0)
    ? avgWin.dividedBy(avgLossOnly)
    : new Decimal(0);

  const largestProfit =
    wonTrades.length > 0
      ? Decimal.max(
        0,
        ...wonTrades.map((t) => new Decimal(t.totalNetProfit || 0))
      )
      : new Decimal(0);
  const largestLoss =
    lostTrades.length > 0
      ? Decimal.max(0, ...lostTrades.map((t) => new Decimal(t.riskAmount || 0)))
      : new Decimal(0);

  let totalRMultiples = new Decimal(0);
  let tradesWithRisk = 0;
  closedTrades.forEach((trade) => {
    if (trade.riskAmount && new Decimal(trade.riskAmount).gt(0)) {
      const rMultiple =
        trade.status === "Won"
          ? new Decimal(trade.totalNetProfit || 0).dividedBy(
            new Decimal(trade.riskAmount)
          )
          : new Decimal(-1);
      totalRMultiples = totalRMultiples.plus(rMultiple);
      tradesWithRisk++;
    }
  });
  const avgRMultiple =
    tradesWithRisk > 0
      ? totalRMultiples.dividedBy(tradesWithRisk)
      : new Decimal(0);

  let cumulativeProfit = new Decimal(0),
    peakEquity = new Decimal(0),
    maxDrawdown = new Decimal(0);
  sortedClosedTrades.forEach((trade) => {
    cumulativeProfit = cumulativeProfit.plus(getTradePnL(trade));
    if (cumulativeProfit.gt(peakEquity)) peakEquity = cumulativeProfit;
    const drawdown = peakEquity.minus(cumulativeProfit);
    if (drawdown.gt(maxDrawdown)) maxDrawdown = drawdown;
  });

  const recoveryFactor = maxDrawdown.gt(0)
    ? cumulativeProfit.dividedBy(maxDrawdown)
    : new Decimal(0);
  const lossRate =
    totalTrades > 0 ? (lostTrades.length / totalTrades) * 100 : 0;
  const expectancy = new Decimal(winRate / 100)
    .times(avgWin)
    .minus(new Decimal(lossRate / 100).times(avgLossOnly));

  let totalProfitLong = new Decimal(0),
    totalLossLong = new Decimal(0),
    totalProfitShort = new Decimal(0),
    totalLossShort = new Decimal(0);
  closedTrades.forEach((trade) => {
    const pnl = getTradePnL(trade);
    if (trade.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
      if (pnl.gte(0)) totalProfitLong = totalProfitLong.plus(pnl);
      else totalLossLong = totalLossLong.plus(pnl.abs());
    } else {
      if (pnl.gte(0)) totalProfitShort = totalProfitShort.plus(pnl);
      else totalLossShort = totalLossShort.plus(pnl.abs());
    }
  });

  let longestWinningStreak = 0,
    currentWinningStreak = 0,
    longestLosingStreak = 0,
    currentLosingStreak = 0,
    currentStreakText = "N/A";
  sortedClosedTrades.forEach((trade) => {
    if (trade.status === "Won") {
      currentWinningStreak++;
      currentLosingStreak = 0;
      if (currentWinningStreak > longestWinningStreak)
        longestWinningStreak = currentWinningStreak;
    } else {
      currentLosingStreak++;
      currentWinningStreak = 0;
      if (currentLosingStreak > longestLosingStreak)
        longestLosingStreak = currentLosingStreak;
    }
  });
  if (sortedClosedTrades.length > 0) {
    const lastIsWin =
      sortedClosedTrades[sortedClosedTrades.length - 1].status === "Won";
    let streak = 0;
    for (let i = sortedClosedTrades.length - 1; i >= 0; i--) {
      if (
        (lastIsWin && sortedClosedTrades[i].status === "Won") ||
        (!lastIsWin && sortedClosedTrades[i].status === "Lost")
      )
        streak++;
      else break;
    }
    currentStreakText = `${lastIsWin ? "W" : "L"}${streak}`;
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
    largestProfit,
    largestLoss,
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

export function calculateSymbolPerformance(journalData: JournalEntry[]) {
  const closedTrades = journalData.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );
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

export function getTagData(trades: JournalEntry[]) {
  const tagStats: {
    [key: string]: { win: number; loss: number; pnl: Decimal; count: number };
  } = {};

  trades.forEach((t) => {
    if (t.status === "Open") return;
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
  const pnlData = labels.map((l) => tagStats[l].pnl.toNumber());
  const winRateData = labels.map(
    (l) => (tagStats[l].win / tagStats[l].count) * 100
  );

  return {
    labels,
    pnlData,
    winRateData,
  };
}

export function getCalendarData(trades: JournalEntry[]) {
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

  trades.forEach((t) => {
    if (t.status === "Open") return;

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
    pnl: data.pnl.toNumber(),
    count: data.count,
    winCount: data.winCount,
    lossCount: data.lossCount,
    bestSymbol: data.bestSymbol,
    bestSymbolPnl: data.bestSymbolPnl.isFinite()
      ? data.bestSymbolPnl.toNumber()
      : 0,
  }));
}

export function getRollingData(
  journal: JournalEntry[],
  windowSize: number = 20
) {
  const sortedTrades = journal
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      if (t.riskAmount && t.riskAmount.gt(0)) {
        rMultiples.push(pnl.div(t.riskAmount).toNumber());
      } else {
        // Fallback if no risk info, use 0 or skip?
        // To avoid breaking SQN, we skip or use a proxy.
        // Let's assume normalized if risk is missing? No, safer to skip.
      }
    });

    // Handle Infinity
    let pf = 0;
    if (grossLoss.isZero()) {
      pf = grossWin.gt(0) ? 10 : 0; // Cap at 10 for visualization
    } else {
      pf = grossWin.div(grossLoss).toNumber();
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

    // Label: use the date of the last trade in the window
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

export function getLeakageData(journal: JournalEntry[]) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

  let totalGrossProfit = new Decimal(0);
  let totalGrossLoss = new Decimal(0); // Absolute value
  let totalFees = new Decimal(0);

  closedTrades.forEach((t) => {
    const pnl = getTradePnL(t);
    const fees = (t.totalFees || new Decimal(0))
      .plus(t.fundingFee || new Decimal(0))
      .plus(t.tradingFee || new Decimal(0));

    // Reconstruct Gross PnL from Net PnL + Fees
    // Net = Gross - Fees  => Gross = Net + Fees
    const grossPnl = pnl.plus(fees);

    if (grossPnl.gt(0)) {
      totalGrossProfit = totalGrossProfit.plus(grossPnl);
    } else {
      totalGrossLoss = totalGrossLoss.plus(grossPnl.abs());
    }

    totalFees = totalFees.plus(fees);
  });

  // 1. Fee Efficiency
  // How much of Gross Profit is kept? (Net Profit / Gross Profit)
  // If Gross Profit is 0, retention is 0 (or undefined)
  const totalNetProfit = totalGrossProfit
    .minus(totalGrossLoss)
    .minus(totalFees);
  const profitRetention = totalGrossProfit.gt(0)
    ? totalNetProfit.div(totalGrossProfit).times(100).toNumber()
    : 0;

  // How much is lost to fees relative to Gross Profit?
  const feeImpact = totalGrossProfit.gt(0)
    ? totalFees.div(totalGrossProfit).times(100).toNumber()
    : 0;

  // Waterfall Data
  const waterfallData = {
    grossProfit: totalGrossProfit.toNumber(),
    fees: totalFees.negated().toNumber(), // Negative for visualization
    grossLoss: totalGrossLoss.negated().toNumber(), // Negative for visualization
    netResult: totalNetProfit.toNumber(),
  };

  // 2. Worst Tags (Strategy Leakage)
  // Need to avoid circular dependency if getTagData was in same file.
  // It is in same file, so we can call it.
  const tagStats = getTagData(closedTrades);
  const worstTags = tagStats.labels
    .map((label, i) => ({ label, pnl: tagStats.pnlData[i] }))
    .filter((item) => item.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl) // Ascending (most negative first)
    .slice(0, 5); // Bottom 5

  // 3. Worst Times (Timing Leakage)
  const timingStats = getTimingData(closedTrades);

  // Worst Hours (by Gross Loss)
  // timingStats.hourlyGrossLoss contains negative numbers representing magnitude of loss
  const worstHours = timingStats.hourlyGrossLoss
    .map((loss, hour) => ({ hour, loss: Math.abs(loss) }))
    .filter((h) => h.loss > 0) // FIRST: Filter only hours with losses
    .sort((a, b) => b.loss - a.loss) // THEN: Sort descending
    .slice(0, 5); // FINALLY: Take top 5

  const worstDays = timingStats.dayLabels
    .map((day, i) => ({ day, loss: Math.abs(timingStats.dayOfWeekGrossLoss[i]) }))
    .filter((d) => d.loss > 0) // FIRST: Filter only days with losses
    .sort((a, b) => b.loss - a.loss) // THEN: Sort descending
    .slice(0, 3); // FINALLY: Take top 3

  return {
    profitRetention,
    feeImpact,
    waterfallData,
    totalFees: totalFees.toNumber(),
    worstTags,
    worstHours,
    worstDays,
  };
}

export function getDurationStats(journal: JournalEntry[]) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

  // Buckets: <15m, 15m-1h, 1h-4h, 4h-24h, >24h
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
  const pnlData = buckets.map((b) => b.pnl.toNumber());
  const winRateData = buckets.map((b) =>
    b.count > 0 ? (b.win / b.count) * 100 : 0
  );

  return { labels, pnlData, winRateData };
}

export function getTimingData(trades: JournalEntry[]) {
  // Initialize arrays for 24 hours
  const hourlyNetPnl = new Array(24).fill(0).map(() => new Decimal(0));
  const hourlyGrossProfit = new Array(24).fill(0).map(() => new Decimal(0));
  const hourlyGrossLoss = new Array(24).fill(0).map(() => new Decimal(0));

  // Initialize arrays for 7 days (0=Sun, 6=Sat)
  const dayNetPnl = new Array(7).fill(0).map(() => new Decimal(0));
  const dayGrossProfit = new Array(7).fill(0).map(() => new Decimal(0));
  const dayGrossLoss = new Array(7).fill(0).map(() => new Decimal(0));

  trades.forEach((t) => {
    if (t.status === "Open") return;
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
    arr[1],
    arr[2],
    arr[3],
    arr[4],
    arr[5],
    arr[6],
    arr[0],
  ];

  return {
    hourlyPnl: hourlyNetPnl.map((d) => d.toNumber()),
    hourlyGrossProfit: hourlyGrossProfit.map((d) => d.toNumber()),
    hourlyGrossLoss: hourlyGrossLoss.map((d) => d.toNumber()), // Keep negative numbers negative
    dayOfWeekPnl: reorder(dayNetPnl).map((d) => d.toNumber()),
    dayOfWeekGrossProfit: reorder(dayGrossProfit).map((d) => d.toNumber()),
    dayOfWeekGrossLoss: reorder(dayGrossLoss).map((d) => d.toNumber()),
    dayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };
}

export function getDisciplineData(journal: JournalEntry[]) {
  // Reuse timing data for hourly PnL
  const timing = getTimingData(journal);

  // Calculate Streaks
  const sortedTrades = journal
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

  // Risk Consistency Buckets
  const riskBuckets: { [key: string]: number } = {};
  const risks = sortedTrades
    .filter((t) => t.riskAmount && t.riskAmount.gt(0))
    .map((t) => t.riskAmount!.toNumber());

  if (risks.length > 0) {
    const minRisk = Math.min(...risks);
    const maxRisk = Math.max(...risks);

    if (Math.abs(maxRisk - minRisk) < 0.01) {
      riskBuckets[`$${(maxRisk ?? 0).toFixed(2)}`] = risks.length;
    } else {
      // Create 5 bins
      const binCount = 5;
      const range = maxRisk - minRisk;
      const step = range / binCount;

      risks.forEach((r) => {
        // Determine bin index
        let idx = Math.floor((r - minRisk) / step);
        if (idx >= binCount) idx = binCount - 1; // Handle max value case

        const low = minRisk + idx * step;
        const high = minRisk + (idx + 1) * step;

        // Format: $10 - $20
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
