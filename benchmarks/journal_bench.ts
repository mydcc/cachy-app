import { calculator } from "../src/lib/calculator";
import { Decimal } from "decimal.js";
import type { JournalEntry } from "../src/stores/types";

// Mock Data Generator
function generateMockJournal(count: number): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const now = Date.now();
  const dayMs = 86400000;

  for (let i = 0; i < count; i++) {
    const isWin = Math.random() > 0.5;
    const pnl = isWin ? new Decimal(Math.random() * 500 + 100) : new Decimal(Math.random() * -200 - 50);
    const date = new Date(now - Math.floor(Math.random() * 365) * dayMs).toISOString();

    entries.push({
      id: i,
      date: date,
      symbol: Math.random() > 0.5 ? "BTCUSDT" : "ETHUSDT",
      tradeType: Math.random() > 0.5 ? "Long" : "Short",
      status: isWin ? "Won" : "Lost",
      accountSize: new Decimal(10000),
      riskPercentage: new Decimal(1),
      leverage: new Decimal(10),
      fees: new Decimal(5),
      entryPrice: new Decimal(50000),
      exitPrice: new Decimal(51000),
      stopLossPrice: new Decimal(49000),
      atrValue: new Decimal(100),
      mae: new Decimal(1),
      mfe: new Decimal(2),
      efficiency: new Decimal(50),
      totalRR: isWin ? new Decimal(2) : new Decimal(-1),
      totalNetProfit: pnl,
      riskAmount: new Decimal(100),
      totalFees: new Decimal(5),
      maxPotentialProfit: new Decimal(1000),
      notes: "Test trade",
      targets: [],
      calculatedTpDetails: [],
      isManual: true,
      tags: ["Trend", "Breakout"],
      provider: "custom"
    });
  }
  return entries;
}

async function runBenchmark() {
  const entryCount = 2000;
  console.log(`Generating ${entryCount} journal entries...`);
  const entries = generateMockJournal(entryCount);

  console.log("Running baseline benchmark (individual calls)...");
  const startOld = performance.now();

  const metricsOld = {
    performance: calculator.getPerformanceData(entries),
    quality: calculator.getQualityData(entries),
    direction: calculator.getDirectionData(entries),
    tag: calculator.getTagData(entries),
    calendar: calculator.getCalendarData(entries),
    discipline: calculator.getDisciplineData(entries),
    cost: calculator.getCostData(entries),
    timing: calculator.getTimingData(entries),
    confluence: calculator.getConfluenceData(entries),
    durationStats: calculator.getDurationStats(entries),
    durationData: calculator.getDurationData(entries),
    tagEvolution: calculator.getTagEvolution(entries),
    asset: calculator.getAssetData(entries),
    risk: calculator.getRiskData(entries),
    market: calculator.getMarketData(entries),
    psychology: calculator.getPsychologyData(entries),
    execution: calculator.getExecutionEfficiencyData(entries),
    riskRadar: calculator.getVisualRiskRadarData(entries),
    volatility: calculator.getVolatilityMatrixData(entries),
    systemQuality: calculator.getSystemQualityData(entries)
  };

  const endOld = performance.now();
  const timeOld = endOld - startOld;
  console.log(`Individual Calls Time: ${timeOld.toFixed(2)} ms`);

  console.log("Running optimized benchmark (getJournalAnalysis)...");
  const startNew = performance.now();

  const metricsNew = calculator.getJournalAnalysis(entries);

  const endNew = performance.now();
  const timeNew = endNew - startNew;
  console.log(`Optimized Analysis Time: ${timeNew.toFixed(2)} ms`);
  console.log(`Speedup: ${(timeOld / timeNew).toFixed(2)}x`);
}

runBenchmark();
