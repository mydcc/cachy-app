import re

file_path = 'src/lib/calculators/stats.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Replace the else if (isLoss) block with else
# We need to find the specific block.
# Since I wrote the file with specific indentation, I can target it.

old_block = """      } else if (isLoss) {
          lostCount++;
          // Total Loss uses riskAmount (legacy logic preserved)
          const loss = new Decimal(trade.riskAmount || 0);
          totalLoss = totalLoss.plus(loss);
          if (loss.gt(maxLoss)) maxLoss = loss;

          // Streak
          currentLosingStreak++;
          currentWinningStreak = 0;
          if (currentLosingStreak > longestLosingStreak) longestLosingStreak = currentLosingStreak;
      }"""

new_block = """      } else {
          // Treat anything not Won as a Loss for streak/stats purposes (matching original logic)
          // However, we only increment lostCount if it is actually "Lost"?
          // Original logic:
          // const lostTrades = closedTrades.filter((t) => t.status === "Lost");
          // So lostCount and totalLoss ONLY included "Lost".
          // BUT Streak logic included ANYTHING ELSE as "Loss".

          // My previous code:
          // else if (isLoss) { lostCount++ ... }

          // If I change to `else`, I need to split the logic:
          // 1. Streak logic: applies to ALL non-wins.
          // 2. Loss Stats logic: applies ONLY to "Lost".

          // So:

          // Streak (All non-wins)
          currentLosingStreak++;
          currentWinningStreak = 0;
          if (currentLosingStreak > longestLosingStreak) longestLosingStreak = currentLosingStreak;

          // Loss Stats (Only "Lost")
          if (isLoss) {
              lostCount++;
              const loss = new Decimal(trade.riskAmount || 0);
              totalLoss = totalLoss.plus(loss);
              if (loss.gt(maxLoss)) maxLoss = loss;
          }
      }"""

# Actually, the original code had:
# const lostTrades = closedTrades.filter((t) => t.status === "Lost");
# ...
# sortedClosedTrades.forEach((trade) => {
#    if (trade.status === "Won") { ... } else { ...streak... }
# });

# So Streak logic was indeed separate from lostTrades stats.
# My optimized code fused them.
# So I must decouple them inside the loop.

# I will rewrite the loop body to be cleaner and separate these concerns.

loop_body_start = "  for (const trade of sortedTrades) {"
loop_body_end = "  // Derived Stats calculation"

# I'll use regex to replace the whole loop body.
# But python regex with multi-line is tricky.
# I'll just rewrite the whole function using the same python script approach as before.

"""
    export function calculatePerformanceStats(
    // ...
    // Single Pass Loop
    for (const trade of sortedTrades) {
      totalTrades++;
      const pnl = getTradePnL(trade);
      const isWin = trade.status === "Won";
      const isLoss = trade.status === "Lost";

      // Win Stats
      if (isWin) {
          wonCount++;
          const profit = new Decimal(trade.totalNetProfit || 0);
          totalProfit = totalProfit.plus(profit);
          if (profit.gt(maxProfit)) maxProfit = profit;
      }

      // Loss Stats (Strictly "Lost")
      if (isLoss) {
          lostCount++;
          const loss = new Decimal(trade.riskAmount || 0);
          totalLoss = totalLoss.plus(loss);
          if (loss.gt(maxLoss)) maxLoss = loss;
      }

      // Streak Logic (Original: Won vs Else)
      if (isWin) {
          currentWinningStreak++;
          currentLosingStreak = 0;
          if (currentWinningStreak > longestWinningStreak) longestWinningStreak = currentWinningStreak;
      } else {
          currentLosingStreak++;
          currentWinningStreak = 0;
          if (currentLosingStreak > longestLosingStreak) longestLosingStreak = currentLosingStreak;
      }

      // ... rest ...
    }
"""

new_func = """export function calculatePerformanceStats(
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
          const profit = new Decimal(trade.totalNetProfit || 0);
          totalProfit = totalProfit.plus(profit);
          if (profit.gt(maxProfit)) maxProfit = profit;
      }

      // Loss Stats
      if (isLoss) {
          lostCount++;
          const loss = new Decimal(trade.riskAmount || 0);
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
          totalRRSum = totalRRSum.plus(new Decimal(trade.totalRR));
      }

      // R Multiple
      if (trade.riskAmount && new Decimal(trade.riskAmount).gt(0)) {
          const rMultiple = isWin
            ? new Decimal(trade.totalNetProfit || 0).dividedBy(new Decimal(trade.riskAmount))
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
}"""

# Reuse finding logic
start_idx = content.find("export function calculatePerformanceStats")
if start_idx == -1:
    print("Function not found")
    exit(1)

open_braces = 0
end_idx = -1
found_start = False
for i in range(start_idx, len(content)):
    if content[i] == '{':
        open_braces += 1
        found_start = True
    elif content[i] == '}':
        open_braces -= 1
        if found_start and open_braces == 0:
            end_idx = i + 1
            break

if end_idx != -1:
    content = content[:start_idx] + new_func + content[end_idx:]
    with open(file_path, 'w') as f:
        f.write(content)
    print("Function replaced successfully")
else:
    print("Could not find end of function")
    exit(1)
