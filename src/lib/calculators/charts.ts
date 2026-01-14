import { Decimal } from "decimal.js";
import { CONSTANTS } from "../constants";
import type { JournalEntry } from "../../stores/types";
import { getTradePnL } from "./core";
import {
  calculateJournalStats,
  calculatePerformanceStats,
  getTagData,
  getTimingData,
  getDisciplineData as getDisciplineStats,
} from "./stats";

// Re-export getDisciplineData from stats for consumers who expect it here, or use the alias
export const getDisciplineData = getDisciplineStats;

export function getPerformanceData(journal: JournalEntry[]) {
  const closedTrades = journal
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 1. Equity Curve
  let cumulative = new Decimal(0);
  const equityCurve = closedTrades.map((t) => {
    const pnl = getTradePnL(t);
    cumulative = cumulative.plus(pnl);
    return { x: t.date, y: cumulative.toNumber() };
  });

  // 2. Drawdown Series
  let peak = new Decimal(0);
  let currentDrawdown = new Decimal(0);
  let runningPnl = new Decimal(0);
  const drawdownSeries = closedTrades.map((t) => {
    const pnl = getTradePnL(t);
    runningPnl = runningPnl.plus(pnl);
    if (runningPnl.gt(peak)) peak = runningPnl;
    currentDrawdown = runningPnl.minus(peak); // Should be negative or zero
    return { x: t.date, y: currentDrawdown.toNumber() };
  });

  // 3. Monthly Stats
  const monthlyStats: { [key: string]: Decimal } = {};
  closedTrades.forEach((t) => {
    const date = new Date(t.date);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;
    const pnl = getTradePnL(t);
    monthlyStats[monthKey] = (monthlyStats[monthKey] || new Decimal(0)).plus(
      pnl
    );
  });
  const monthlyLabels = Object.keys(monthlyStats).sort();
  const monthlyData = monthlyLabels.map((k) => monthlyStats[k].toNumber());

  return { equityCurve, drawdownSeries, monthlyLabels, monthlyData };
}

export function getQualityData(journal: JournalEntry[]) {
  const closedTrades = journal
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const won = closedTrades.filter((t) => t.status === "Won").length;
  const lost = closedTrades.filter((t) => t.status === "Lost").length;

  // 1. Win/Loss Distribution (Old) - Keep for backward compatibility if needed
  const winLossData = [won, lost];

  // 1b. Enhanced 6-Segment Distribution
  let winLong = 0,
    winShort = 0,
    lossLong = 0,
    lossShort = 0,
    beLong = 0,
    beShort = 0;

  // Detailed Stats calculation vars
  let totalWin = new Decimal(0);
  let totalLoss = new Decimal(0); // Absolute value
  let countWin = 0;
  let countLoss = 0;

  let countLong = 0;
  let countLongWin = 0;
  let countShort = 0;
  let countShortWin = 0;

  closedTrades.forEach((t) => {
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
      if (isLong) winLong++;
      else winShort++;
    } else if (pnl.lt(0)) {
      if (isLong) lossLong++;
      else lossShort++;
    } else {
      // Break Even (PnL == 0)
      if (isLong) beLong++;
      else beShort++;
    }
  });

  const sixSegmentData = [
    winLong,
    winShort,
    lossLong,
    lossShort,
    beLong,
    beShort,
  ];

  // Detailed Stats
  const avgWin = countWin > 0 ? totalWin.div(countWin) : new Decimal(0);
  const avgLoss = countLoss > 0 ? totalLoss.div(countLoss) : new Decimal(0);
  const profitFactor = totalLoss.gt(0)
    ? totalWin.div(totalLoss)
    : totalWin.gt(0)
      ? new Decimal(Infinity)
      : new Decimal(0);

  const winRate = closedTrades.length > 0 ? countWin / closedTrades.length : 0;
  const lossRate =
    closedTrades.length > 0 ? countLoss / closedTrades.length : 0;
  const expectancy = avgWin.times(winRate).minus(avgLoss.times(lossRate));

  const winRateLong = countLong > 0 ? (countLongWin / countLong) * 100 : 0;
  const winRateShort = countShort > 0 ? (countShortWin / countShort) * 100 : 0;

  const detailedStats = {
    profitFactor: profitFactor.toNumber(),
    avgWin: avgWin.toNumber(),
    avgLoss: avgLoss.toNumber(),
    expectancy: expectancy.toNumber(),
    winRateLong,
    winRateShort,
  };

  // 2. R-Multiple Distribution
  const rMultiples: number[] = [];

  closedTrades.forEach((t) => {
    // Only calculate R if riskAmount is present and positive
    if (t.riskAmount && t.riskAmount.gt(0)) {
      const pnl = getTradePnL(t);
      rMultiples.push(pnl.div(t.riskAmount).toNumber());
    }
  });

  // Bucketing R-Multiples
  const buckets: { [key: string]: number } = {
    "<-1R": 0,
    "-1R to 0R": 0,
    "0R to 1R": 0,
    "1R to 2R": 0,
    "2R to 3R": 0,
    ">3R": 0,
  };
  rMultiples.forEach((r) => {
    if (r < -1) buckets["<-1R"]++;
    else if (r < 0) buckets["-1R to 0R"]++;
    else if (r < 1) buckets["0R to 1R"]++;
    else if (r < 2) buckets["1R to 2R"]++;
    else if (r < 3) buckets["2R to 3R"]++;
    else buckets[">3R"]++;
  });

  // 3. Cumulative R Curve
  let cumulativeR = new Decimal(0);
  const cumulativeRCurve = closedTrades.map((t) => {
    let r = new Decimal(0);
    if (t.riskAmount && t.riskAmount.gt(0)) {
      const pnl = getTradePnL(t);
      r = pnl.div(t.riskAmount);
    } else {
      r = new Decimal(0);
    }

    cumulativeR = cumulativeR.plus(r);
    return { x: t.date, y: cumulativeR.toNumber() };
  });

  // 4. KPI
  const stats = calculateJournalStats(journal);

  return {
    winLossData,
    sixSegmentData,
    detailedStats,
    rHistogram: buckets,
    cumulativeRCurve,
    stats,
  };
}

export function getDirectionData(journal: JournalEntry[]) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

  // 1. Long vs Short
  let longPnl = new Decimal(0);
  let shortPnl = new Decimal(0);
  closedTrades.forEach((t) => {
    const pnl = getTradePnL(t);
    if (t.tradeType === CONSTANTS.TRADE_TYPE_LONG) longPnl = longPnl.plus(pnl);
    else shortPnl = shortPnl.plus(pnl);
  });

  // 2. Symbol Performance (Top 5 / Bottom 5)
  const symbolMap: { [key: string]: Decimal } = {};
  closedTrades.forEach((t) => {
    const pnl = getTradePnL(t);
    symbolMap[t.symbol] = (symbolMap[t.symbol] || new Decimal(0)).plus(pnl);
  });

  const sortedSymbols = Object.entries(symbolMap).sort((a, b) =>
    b[1].minus(a[1]).toNumber()
  );
  const topSymbols = sortedSymbols.slice(0, 5);
  const bottomSymbols = sortedSymbols.slice(-5).reverse(); // Worst first

  // 3. Direction Evolution (Cumulative PnL)
  let cumLong = new Decimal(0);
  let cumShort = new Decimal(0);
  const longCurve: { x: any; y: number }[] = [];
  const shortCurve: { x: any; y: number }[] = [];

  // Sort trades by date for evolution
  const sortedByDate = [...closedTrades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  sortedByDate.forEach((t) => {
    const pnl = getTradePnL(t);
    if (t.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
      cumLong = cumLong.plus(pnl);
    } else {
      cumShort = cumShort.plus(pnl);
    }
    longCurve.push({ x: t.date, y: cumLong.toNumber() });
    shortCurve.push({ x: t.date, y: cumShort.toNumber() });
  });

  return {
    longPnl: longPnl.toNumber(),
    shortPnl: shortPnl.toNumber(),
    topSymbols: {
      labels: topSymbols.map((s) => s[0]),
      data: topSymbols.map((s) => s[1].toNumber()),
    },
    bottomSymbols: {
      labels: bottomSymbols.map((s) => s[0]),
      data: bottomSymbols.map((s) => s[1].toNumber()),
    },
    longCurve,
    shortCurve,
  };
}

export function getCostData(journal: JournalEntry[]) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

  // 1. Gross vs Net PnL (Total)
  let totalGross = new Decimal(0);
  let totalNet = new Decimal(0);
  let totalFees = new Decimal(0);

  closedTrades.forEach((t) => {
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
  const feeCurve = closedTrades
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((t) => {
      const fees = t.totalFees || new Decimal(0);
      const funding = t.fundingFee || new Decimal(0);
      const trading = t.tradingFee || new Decimal(0);
      cumFees = cumFees.plus(fees).plus(funding).plus(trading);
      return { x: t.date, y: cumFees.toNumber() };
    });

  // 3. Fee Structure
  let sumTrading = new Decimal(0);
  let sumFunding = new Decimal(0);
  closedTrades.forEach((t) => {
    sumTrading = sumTrading.plus(t.tradingFee || t.fees || 0); // fallback to fees if tradingFee not set
    sumFunding = sumFunding.plus(t.fundingFee || 0);
  });

  return {
    gross: totalGross.toNumber(),
    net: totalNet.toNumber(),
    feeCurve,
    feeStructure: {
      trading: sumTrading.toNumber(),
      funding: sumFunding.toNumber(),
    },
  };
}

export function getDurationData(journal: JournalEntry[]) {
  // Scatter: x = Duration (minutes), y = PnL ($)
  const scatterData = journal
    .filter((t) => t.status !== "Open")
    .map((t) => {
      let startTs = 0;
      let endTs = 0;

      if (t.entryDate) {
        startTs = new Date(t.entryDate).getTime();
      } else if (t.isManual !== false) {
        startTs = new Date(t.date).getTime();
      }

      if (t.isManual === false) {
        endTs = new Date(t.date).getTime();
      } else {
        if (t.exitDate) endTs = new Date(t.exitDate).getTime();
      }

      if (startTs > 0 && endTs > 0 && !isNaN(startTs) && !isNaN(endTs)) {
        const diff = endTs - startTs;
        if (diff > 0) {
          const durationMinutes = diff / 1000 / 60;
          const pnl = getTradePnL(t);
          return {
            x: durationMinutes,
            y: pnl.toNumber(),
            r: 6,
            l: `${t.symbol}: ${Math.round(durationMinutes)}m -> $${(pnl ?? new Decimal(0)).toFixed(
              2
            )}`,
          };
        }
      }
      return null;
    })
    .filter((d) => d !== null);

  return { scatterData };
}

export function getAssetData(journal: JournalEntry[]) {
  const symbolStats: {
    [key: string]: { win: number; loss: number; pnl: Decimal; count: number };
  } = {};

  journal.forEach((t) => {
    if (t.status === "Open") return;
    const sym = t.symbol;
    if (!symbolStats[sym])
      symbolStats[sym] = { win: 0, loss: 0, pnl: new Decimal(0), count: 0 };

    symbolStats[sym].count++;

    const pnl = getTradePnL(t);
    symbolStats[sym].pnl = symbolStats[sym].pnl.plus(pnl);

    if (t.status === "Won") symbolStats[sym].win++;
    else symbolStats[sym].loss++;
  });

  // Bubble Data: x=WinRate, y=PnL, r=Count (scaled)
  const bubbleData = Object.keys(symbolStats).map((sym) => {
    const s = symbolStats[sym];
    const winRate = s.count > 0 ? (s.win / s.count) * 100 : 0;
    return {
      x: winRate,
      y: s.pnl.toNumber(),
      r: Math.min(Math.max(s.count * 2, 5), 30), // Scale radius
      l: `${sym}: ${s.count} Trades, ${(winRate ?? 0).toFixed(
        1
      )}% Win, $${(s.pnl ?? new Decimal(0)).toFixed(2)}`, // Label for tooltip
    };
  });

  return {
    bubbleData,
  };
}

export function getRiskData(journal: JournalEntry[]) {
  // Scatter: x = Risk Amount ($), y = Realized PnL ($)
  const scatterData = journal
    .filter((t) => t.status !== "Open" && t.riskAmount && t.riskAmount.gt(0))
    .map((t) => {
      const pnl = getTradePnL(t);
      return {
        x: t.riskAmount.toNumber(),
        y: pnl.toNumber(),
        r: 6,
        l: `${t.symbol} (${t.status}): Risk $${(t.riskAmount ?? new Decimal(0)).toFixed(
          2
        )} -> PnL $${(pnl ?? new Decimal(0)).toFixed(2)}`,
      };
    });

  return {
    scatterData,
  };
}

export function getMarketData(journal: JournalEntry[]) {
  let longWin = 0,
    longTotal = 0;
  let shortWin = 0,
    shortTotal = 0;
  const leverageBuckets: { [key: string]: number } = {
    "1-5x": 0,
    "6-10x": 0,
    "11-20x": 0,
    "21-50x": 0,
    "50x+": 0,
  };

  journal.forEach((t) => {
    if (t.status === "Open") return;

    if (t.tradeType === CONSTANTS.TRADE_TYPE_LONG) {
      longTotal++;
      if (t.status === "Won") longWin++;
    } else {
      shortTotal++;
      if (t.status === "Won") shortWin++;
    }

    const lev = t.leverage ? t.leverage.toNumber() : 1;
    if (lev <= 5) leverageBuckets["1-5x"]++;
    else if (lev <= 10) leverageBuckets["6-10x"]++;
    else if (lev <= 20) leverageBuckets["11-20x"]++;
    else if (lev <= 50) leverageBuckets["21-50x"]++;
    else leverageBuckets["50x+"]++;
  });

  const longWinRate = longTotal > 0 ? (longWin / longTotal) * 100 : 0;
  const shortWinRate = shortTotal > 0 ? (shortWin / shortTotal) * 100 : 0;

  return {
    longShortWinRate: [longWinRate, shortWinRate],
    leverageDist: Object.values(leverageBuckets),
    leverageLabels: Object.keys(leverageBuckets),
  };
}

export function getPsychologyData(journal: JournalEntry[]) {
  // Streak Analysis
  const sorted = [...journal]
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  const winStreaks: number[] = [];
  const lossStreaks: number[] = [];

  sorted.forEach((t) => {
    if (t.status === "Won") {
      if (currentLossStreak > 0) {
        lossStreaks.push(currentLossStreak);
        currentLossStreak = 0;
      }
      currentWinStreak++;
    } else if (t.status === "Lost") {
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
  const winStreakCounts: { [key: number]: number } = {};
  const lossStreakCounts: { [key: number]: number } = {};

  winStreaks.forEach(
    (s) => (winStreakCounts[s] = (winStreakCounts[s] || 0) + 1)
  );
  lossStreaks.forEach(
    (s) => (lossStreakCounts[s] = (lossStreakCounts[s] || 0) + 1)
  );

  // Prepare labels (1 to max streak)
  const maxStreak = Math.max(...winStreaks, ...lossStreaks, 0);
  const streakLabels = Array.from({ length: maxStreak }, (_, i) =>
    (i + 1).toString()
  );

  const winStreakData = streakLabels.map(
    (l) => winStreakCounts[parseInt(l)] || 0
  );
  const lossStreakData = streakLabels.map(
    (l) => lossStreakCounts[parseInt(l)] || 0
  );

  return {
    winStreakData,
    lossStreakData,
    streakLabels,
  };
}

export function getTagEvolution(journal: JournalEntry[]) {
  const closedTrades = journal
    .filter((t) => t.status === "Won" || t.status === "Lost")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Identify Top 5 Tags by Abs PnL
  const tagStats = getTagData(closedTrades);
  const topTags = tagStats.labels
    .map((label, i) => ({ label, pnl: Math.abs(tagStats.pnlData[i]) }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 5)
    .map((t) => t.label);

  const datasets = topTags.map((tag) => {
    let cumulative = 0;
    const data: { x: any; y: number }[] = [];

    closedTrades.forEach((t) => {
      const tags = t.tags && t.tags.length > 0 ? t.tags : ["No Tag"];
      if (tags.includes(tag)) {
        cumulative += getTradePnL(t).toNumber();
        data.push({ x: t.date, y: cumulative });
      }
    });
    return { label: tag, data };
  });

  return { datasets };
}

export function getConfluenceData(journal: JournalEntry[]) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const matrix = Array.from({ length: 7 }, (_, dayIdx) => {
    return {
      day: days[dayIdx],
      hours: Array.from({ length: 24 }, (_, hourIdx) => ({
        hour: hourIdx,
        pnl: new Decimal(0),
        count: 0,
      })),
    };
  });

  closedTrades.forEach((t) => {
    const date = new Date(t.date);
    if (isNaN(date.getTime())) return;
    const day = date.getDay(); // 0-6
    const hour = date.getHours(); // 0-23

    const pnl = getTradePnL(t);
    matrix[day].hours[hour].pnl = matrix[day].hours[hour].pnl.plus(pnl);
    matrix[day].hours[hour].count++;
  });

  // Reorder to Mon-Sun
  const reorderedMatrix = [
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4],
    matrix[5],
    matrix[6],
    matrix[0],
  ];

  return reorderedMatrix.map((row) => ({
    day: row.day,
    hours: row.hours.map((h) => ({
      hour: h.hour,
      pnl: h.pnl.toNumber(),
      count: h.count,
    })),
  }));
}

export function getMonteCarloData(
  journal: JournalEntry[],
  simulations: number = 100,
  horizon: number = 100
) {
  const closedTrades = journal.filter(
    (t) => t.status === "Won" || t.status === "Lost"
  );
  const pnlDistribution = closedTrades.map((t) => getTradePnL(t).toNumber());

  if (pnlDistribution.length < 5) return null; // Need enough data

  const paths: number[][] = [];
  const finalEquityValues: number[] = [];

  // Run Simulations
  for (let s = 0; s < simulations; s++) {
    let currentEquity = 0; // Relative to start of simulation
    const path: number[] = [0];

    for (let h = 0; h < horizon; h++) {
      // Random sample with replacement
      const randomIndex = Math.floor(Math.random() * pnlDistribution.length);
      const randomPnL = pnlDistribution[randomIndex];
      currentEquity += randomPnL;
      path.push(currentEquity);
    }

    paths.push(path);
    finalEquityValues.push(currentEquity);
  }

  // Calculate Percentiles per Step for the "Cone"
  const upperPath: number[] = []; // 90th percentile
  const medianPath: number[] = []; // 50th percentile
  const lowerPath: number[] = []; // 10th percentile

  for (let h = 0; h <= horizon; h++) {
    const valuesAtStep = paths.map((p) => p[h]).sort((a, b) => a - b);

    const idx10 = Math.floor(simulations * 0.1);
    const idx50 = Math.floor(simulations * 0.5);
    const idx90 = Math.floor(simulations * 0.9);

    lowerPath.push(valuesAtStep[idx10]);
    medianPath.push(valuesAtStep[idx50]);
    upperPath.push(valuesAtStep[idx90]);
  }

  // We can also return a few random paths for visualization flavor
  const randomPaths = paths.slice(0, 3);

  return {
    labels: Array.from({ length: horizon + 1 }, (_, i) => i),
    upperPath,
    medianPath,
    lowerPath,
    randomPaths,
  };
}
